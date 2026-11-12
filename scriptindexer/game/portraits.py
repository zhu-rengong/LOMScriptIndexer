import hashlib
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..jsonio import atomic_write_bytes, read_json, write_json
from ..paths import SITE_DATA_DIR
from .assets import AssetSession, _dispose, try_build_generator, unitypy
from .dds import to_dds
from .layout import GameLayout

PORTRAIT_VERSION = 1
PORTRAIT_DIR = SITE_DATA_DIR / "portraits"
THUMBNAIL_SIZE = (80, 92)
HEAD_BAND = 0.42
ASPECT = THUMBNAIL_SIZE[0] / THUMBNAIL_SIZE[1]


def fingerprint(layout: GameLayout) -> str:
    aa = layout.data_dir / "StreamingAssets" / "aa"
    parts = [str(PORTRAIT_VERSION), layout.fingerprint()]
    if aa.is_dir():
        for path in sorted(aa.rglob("*.bundle")):
            stat = path.stat()
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:24]


def cached_manifest(layout: GameLayout, output: Path) -> dict | None:
    cached = read_json(output / "manifest.json")
    if not isinstance(cached, dict) or cached.get("fingerprint") != fingerprint(layout):
        return None
    files = cached.get("files")
    if not isinstance(files, list) or not files or not all(
            isinstance(name, str) and Path(name).name == name
            and (output / name).is_file() for name in files):
        return None
    return cached


def character_expressions(session: AssetSession) -> tuple[dict[str, dict[str, str]], list[dict]]:
    configs = list(session.iter_class({"StoryCharacterConfig"}))
    if not configs:
        raise ValueError("StoryCharacterConfig not found")
    path, obj, _ = configs[0]
    config = session.typetree(path, obj) or {}
    scope = session.file_scope(path)
    characters: dict[str, dict[str, str]] = {}
    issues: list[dict] = []
    for ref in config.get("_list") or []:
        hit = scope.resolve(ref)
        if hit is None:
            issues.append({"reason": "missing_character_data"})
            continue
        data_obj, data_scope = hit
        record = data_scope.session.typetree(data_scope.path, data_obj) or {}
        character = (data_scope.typetree(record.get("_mapping")) or {}).get("Value")
        if not isinstance(character, str) or not character:
            issues.append({"reason": "missing_character_mapping"})
            continue
        expressions = characters.setdefault(character, {})
        for item in record.get("_portraitResourceList") or []:
            expression = (data_scope.typetree(item.get("_mapping")) or {}).get("Value")
            address = item.get("_addressKey")
            if not isinstance(expression, str) or not expression \
                    or not isinstance(address, str) or not address:
                issues.append({"character": character, "reason": "missing_portrait_mapping"})
                continue
            normalized = address.replace("\\", "/")
            known = expressions.get(expression)
            if known is not None and known != normalized:
                issues.append({"character": character, "expression": expression,
                               "reason": "conflicting_address"})
                continue
            expressions[expression] = normalized
    return characters, issues


def bundle_index(layout: GameLayout) -> dict[str, Path]:
    aa = layout.data_dir / "StreamingAssets" / "aa" / "StandaloneWindows64"
    index: dict[str, Path] = {}
    for file in sorted(aa.glob("*.bundle")):
        try:
            env = unitypy().load(str(file))
        except Exception:
            continue
        try:
            for address in env.container:
                index.setdefault(address.replace("\\", "/"), file)
        finally:
            _dispose(env)
    return index


def avatar(image: Any) -> bytes:
    from PIL import Image

    picture = image.convert("RGBA")
    bounds = picture.getchannel("A").getbbox()
    if bounds:
        picture = picture.crop(bounds)
    width, height = picture.size
    band_height = max(4, round(height * HEAD_BAND))
    band_width = min(width, max(4, round(band_height * ASPECT)))
    head = picture.crop((0, 0, width, band_height))
    focus = head.getchannel("A").getbbox()
    center = (focus[0] + focus[2]) // 2 if focus else width // 2
    left = max(0, min(width - band_width, center - band_width // 2))
    frame = picture.crop((left, 0, left + band_width, band_height))
    frame = frame.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    return to_dds(frame.tobytes(), THUMBNAIL_SIZE[0], THUMBNAIL_SIZE[1])


def _targets(characters: dict[str, dict[str, str]], index: dict[str, Path]) \
        -> tuple[dict[Path, dict[str, tuple[str, str]]], list[dict]]:
    grouped: dict[Path, dict[str, tuple[str, str]]] = {}
    missing: list[dict] = []
    for character, expressions in sorted(characters.items()):
        for expression, address in sorted(expressions.items()):
            bundle = index.get(address)
            if bundle is None:
                missing.append({"character": character, "expression": expression,
                                "address": address})
                continue
            grouped.setdefault(bundle, {})[address] = (character, expression)
    return grouped, missing


def _export_images(grouped: dict[Path, dict[str, tuple[str, str]]], output: Path,
                   issues: list[dict], reporter: Reporter) -> dict[str, str]:
    images: dict[str, str] = {}
    for position, (bundle, targets) in enumerate(sorted(grouped.items()), 1):
        try:
            env = unitypy().load(str(bundle))
        except Exception as exc:
            issues.append({"bundle": bundle.name, "reason": "bundle_read_failed",
                           "error": type(exc).__name__})
            continue
        try:
            candidates = sorted(env.container.items(),
                                key=lambda pair: pair[1].type.name != "Sprite")
            for address, obj in candidates:
                key = address.replace("\\", "/")
                if key not in targets or key in images:
                    continue
                if obj.type.name not in ("Sprite", "Texture2D"):
                    continue
                try:
                    payload = avatar(obj.read().image)
                except Exception as exc:
                    issues.append({"address": key, "reason": "image_read_failed",
                                   "error": type(exc).__name__})
                    continue
                name = hashlib.sha256(payload).hexdigest()[:24] + ".dds"
                if not (output / name).is_file():
                    atomic_write_bytes(output / name, payload)
                images[key] = name
        finally:
            _dispose(env)
        if position % 20 == 0 or position == len(grouped):
            reporter.info(f"portraits: {position}/{len(grouped)} bundles, {len(images)} images")
    return images


def export_portraits(layout: GameLayout, reporter: Reporter, *, force: bool = False,
                     output: Path = PORTRAIT_DIR) -> dict:
    if not force and (cached := cached_manifest(layout, output)) is not None:
        reporter.info(f"portraits: {len(cached.get('characters', {}))} characters from cache")
        return cached
    session = AssetSession(layout, try_build_generator(layout), reporter.info)
    try:
        characters, issues = character_expressions(session)
    finally:
        session.close()
    index = bundle_index(layout)
    grouped, missing = _targets(characters, index)
    output.mkdir(parents=True, exist_ok=True)
    images = _export_images(grouped, output, issues, reporter)
    available: dict[str, dict[str, str]] = {}
    for character, expressions in sorted(characters.items()):
        table = {expression: images[address]
                 for expression, address in sorted(expressions.items())
                 if address in images}
        if table:
            available[character] = table
    files = sorted(set(images.values()))
    manifest = {
        "version": PORTRAIT_VERSION,
        "fingerprint": fingerprint(layout),
        "size": list(THUMBNAIL_SIZE),
        "characters": available,
        "files": files,
        "missing": missing,
        "issues": issues,
    }
    write_json(output / "manifest.json", manifest, indent=None)
    for stale in output.iterdir():
        if not stale.is_file() or stale.suffix not in (".dds", ".webp"):
            continue
        if len(stale.stem) == 24 and all(char in "0123456789abcdef" for char in stale.stem) \
                and stale.name not in files:
            stale.unlink()
    reporter.info(
        f"portraits: {len(available)} characters, {len(files)} images,"
        f" {len(missing)} missing, {len(issues)} issues")
    return manifest
