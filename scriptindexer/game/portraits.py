import hashlib
from collections.abc import Mapping
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..jsonio import atomic_write_bytes, read_json, write_json
from ..paths import PORTRAIT_PREVIEW_DIR, SITE_DATA_DIR
from .assets import AssetSession, _dispose, try_build_generator, unitypy
from .framing import AVATAR_SIZE, HEAD_BAND, Frame, default_frame, framing_digest, load_frames
from .layout import GameLayout

PORTRAIT_VERSION = 3
PREVIEW_VERSION = 1
PORTRAIT_DIR = SITE_DATA_DIR / "portraits"
THUMBNAIL_SIZE = AVATAR_SIZE
PREVIEW_MAX = 1400
PREVIEW_QUALITY = 76

Target = tuple[str, str, Frame | None]


@dataclass(frozen=True)
class Export:
    images: dict[tuple[str, str], str]
    artifacts: dict[tuple[str, str], str]
    previews: dict[str, dict]
    files: set[str]


def asset_fingerprint(layout: GameLayout) -> str:
    aa = layout.data_dir / "StreamingAssets" / "aa"
    parts = [str(PORTRAIT_VERSION), layout.fingerprint()]
    if aa.is_dir():
        for path in sorted(aa.rglob("*.bundle")):
            stat = path.stat()
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


def fingerprint(layout: GameLayout) -> str:
    payload = f"{asset_fingerprint(layout)}|{framing_digest()}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:24]


def cached_manifest(layout: GameLayout, output: Path,
                    preview_dir: Path = PORTRAIT_PREVIEW_DIR) -> dict | None:
    cached = read_json(output / "manifest.json")
    if not isinstance(cached, dict) or cached.get("fingerprint") != fingerprint(layout):
        return None
    files = cached.get("files")
    if not isinstance(files, list) or not files or not all(
            isinstance(name, str) and Path(name).name == name
            and (output / name).is_file() for name in files):
        return None
    if not _previews_ready(layout, preview_dir):
        return None
    return cached


def _previews_ready(layout: GameLayout, preview_dir: Path) -> bool:
    index = read_json(preview_dir / "index.json")
    if not isinstance(index, dict) or index.get("assets") != asset_fingerprint(layout):
        return False
    artifacts = index.get("artifacts")
    if not isinstance(artifacts, dict):
        return False
    for entry in artifacts.values():
        if not isinstance(entry, dict):
            return False
        name = entry.get("file")
        if not isinstance(name, str) or Path(name).name != name:
            return False
        if not (preview_dir / name).is_file():
            return False
    return True


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


def _picture(image: Any) -> Any:
    picture = image.convert("RGBA")
    bounds = picture.getchannel("A").getbbox()
    if bounds:
        picture = picture.crop(bounds)
    return picture


def _default_frame(picture: Any) -> Frame:
    width, height = picture.size
    band_height = max(4, round(height * HEAD_BAND))
    head = picture.crop((0, 0, width, band_height))
    return default_frame(picture.size, head.getchannel("A").getbbox())


def avatar(picture: Any, frame: Frame) -> bytes:
    from PIL import Image

    left, top, width, height = frame.box(picture.size)
    crop = picture.crop((left, top, left + width, top + height))
    crop = crop.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    output = BytesIO()
    crop.save(output, format="WEBP", quality=85, method=4)
    return output.getvalue()


def preview(picture: Any) -> bytes:
    from PIL import Image

    crop = picture.copy()
    crop.thumbnail((PREVIEW_MAX, PREVIEW_MAX), Image.Resampling.LANCZOS)
    output = BytesIO()
    crop.save(output, format="WEBP", quality=PREVIEW_QUALITY, method=4)
    return output.getvalue()


def _targets(characters: dict[str, dict[str, str]], index: dict[str, Path],
             frames: dict[str, dict[str, Frame]]) \
        -> tuple[dict[Path, dict[str, list[Target]]], list[dict]]:
    grouped: dict[Path, dict[str, list[Target]]] = {}
    missing: list[dict] = []
    for character, expressions in sorted(characters.items()):
        table = frames.get(character, {})
        for expression, address in sorted(expressions.items()):
            bundle = index.get(address)
            if bundle is None:
                missing.append({"character": character, "expression": expression,
                                "address": address})
                continue
            entry = grouped.setdefault(bundle, {}).setdefault(address, [])
            entry.append((character, expression, table.get(expression)))
    return grouped, missing


def _artifact_key(prefix: str, address: str) -> str:
    return hashlib.sha256(f"{prefix}|{address}".encode("utf-8")).hexdigest()[:24]


def _export_images(grouped: dict[Path, dict[str, list[Target]]], output: Path,
                   preview_dir: Path, issues: list[dict], reporter: Reporter) -> Export:
    images: dict[tuple[str, str], str] = {}
    artifact_of: dict[tuple[str, str], str] = {}
    previews: dict[str, dict] = {}
    files: set[str] = set()
    for position, (bundle, targets) in enumerate(sorted(grouped.items()), 1):
        try:
            env = unitypy().load(str(bundle))
            stat = bundle.stat()
        except Exception as exc:
            issues.append({"bundle": bundle.name, "reason": "bundle_read_failed",
                           "error": type(exc).__name__})
            continue
        prefix = f"{bundle.name}|{stat.st_size}|{stat.st_mtime_ns}"
        try:
            candidates = sorted(env.container.items(),
                                key=lambda pair: pair[1].type.name != "Sprite")
            handled: set[str] = set()
            for address, obj in candidates:
                key = address.replace("\\", "/")
                if key not in targets or key in handled:
                    continue
                if obj.type.name not in ("Sprite", "Texture2D"):
                    continue
                handled.add(key)
                try:
                    picture = _picture(obj.read().image)
                except Exception as exc:
                    issues.append({"address": key, "reason": "image_read_failed",
                                   "error": type(exc).__name__})
                    continue
                artifact = _artifact_key(prefix, key)
                name = f"{artifact}.webp"
                default = _default_frame(picture)
                previews[artifact] = {"file": name, "size": list(picture.size),
                                      "default": default.wire()}
                files.add(name)
                if not (preview_dir / name).is_file():
                    try:
                        atomic_write_bytes(preview_dir / name, preview(picture))
                    except Exception as exc:
                        issues.append({"address": key, "reason": "preview_write_failed",
                                       "error": type(exc).__name__})
                rendered: dict[tuple[float, float, float], str] = {}
                for character, expression, frame in targets[key]:
                    active = frame or default
                    cache_key = (round(active.x, 5), round(active.y, 5), round(active.w, 5))
                    digest = rendered.get(cache_key)
                    if digest is None:
                        try:
                            payload = avatar(picture, active)
                        except Exception as exc:
                            issues.append({"address": key, "reason": "image_crop_failed",
                                           "error": type(exc).__name__})
                            continue
                        digest = hashlib.sha256(payload).hexdigest()[:24] + ".webp"
                        if not (output / digest).is_file():
                            atomic_write_bytes(output / digest, payload)
                        rendered[cache_key] = digest
                    images[(character, expression)] = digest
                    artifact_of[(character, expression)] = artifact
        finally:
            _dispose(env)
        if position % 20 == 0 or position == len(grouped):
            reporter.info(f"portraits: {position}/{len(grouped)} bundles, {len(images)} images")
    return Export(images, artifact_of, previews, files)


def _sweep(directory: Path, keep: set[str], suffixes: tuple[str, ...]) -> None:
    for stale in directory.iterdir():
        if not stale.is_file() or stale.suffix not in suffixes:
            continue
        if len(stale.stem) == 24 and all(char in "0123456789abcdef" for char in stale.stem) \
                and stale.name not in keep:
            stale.unlink()


def export_portraits(layout: GameLayout, reporter: Reporter, *, force: bool = False,
                     output: Path = PORTRAIT_DIR, preview_dir: Path = PORTRAIT_PREVIEW_DIR,
                     labels: Mapping[str, str] | None = None) -> dict:
    if not force and (cached := cached_manifest(layout, output, preview_dir)) is not None:
        reporter.info(f"portraits: {len(cached.get('characters', {}))} characters from cache")
        return cached
    session = AssetSession(layout, try_build_generator(layout), reporter.info)
    try:
        characters, issues = character_expressions(session)
    finally:
        session.close()
    frames = load_frames()
    index = bundle_index(layout)
    grouped, missing = _targets(characters, index, frames)
    output.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    exported = _export_images(grouped, output, preview_dir, issues, reporter)
    names = labels or {}
    available: dict[str, dict[str, str]] = {}
    preview_characters: dict[str, dict] = {}
    for character, expressions in sorted(characters.items()):
        table: dict[str, str] = {}
        variants: dict[str, str] = {}
        for expression in sorted(expressions):
            key = (character, expression)
            file = exported.images.get(key)
            if file is None:
                continue
            table[expression] = file
            variants[expression] = exported.artifacts[key]
        if table:
            available[character] = table
            preview_characters[character] = {"label": names.get(character) or character,
                                             "expressions": variants}
    files = sorted(set(exported.images.values()))
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
    write_json(preview_dir / "index.json", {
        "version": PREVIEW_VERSION,
        "avatar": list(THUMBNAIL_SIZE),
        "head_band": HEAD_BAND,
        "assets": asset_fingerprint(layout),
        "settings": framing_digest(),
        "artifacts": dict(sorted(exported.previews.items())),
        "characters": preview_characters,
    }, indent=None)
    _sweep(output, set(files), (".dds", ".webp"))
    _sweep(preview_dir, exported.files, (".webp",))
    reporter.info(
        f"portraits: {len(available)} characters, {len(files)} images,"
        f" {len(exported.previews)} previews, {len(missing)} missing, {len(issues)} issues")
    return manifest
