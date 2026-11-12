import hashlib
import os
import time
from collections.abc import Mapping
from concurrent.futures import Future, ThreadPoolExecutor
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
from .portrait_cache import (
    bundle_dir,
    frame_at,
    load_bundle_cache,
    same_frame_value,
    same_settings_snapshot,
    save_bundle_cache,
    settings_snapshot,
)

PORTRAIT_VERSION = 4
PREVIEW_VERSION = 1
PORTRAIT_DIR = SITE_DATA_DIR / "portraits"
THUMBNAIL_SIZE = AVATAR_SIZE
PREVIEW_MAX = 1400
PREVIEW_QUALITY = 76
PREVIEW_METHOD = 1
DEFAULT_JOBS = 8
MAX_ISSUES = 200

Target = tuple[str, str, Frame | None]


@dataclass(frozen=True)
class Export:
    images: dict[tuple[str, str], str]
    artifacts: dict[tuple[str, str], str]
    previews: dict[str, dict]


@dataclass(frozen=True)
class Render:
    images: list[tuple[str, str, str]]
    artifact: str
    preview: dict
    errors: list[tuple[str, str, str]]


@dataclass(frozen=True)
class Previous:
    manifest: dict
    previews: dict


@dataclass(frozen=True)
class Plan:
    grouped: dict[Path, dict[str, list[Target]]]
    missing: list[dict]
    images: dict[tuple[str, str], str]
    artifacts: dict[tuple[str, str], str]
    fallback: dict[tuple[str, str], tuple[str, str]]


class RenderError(Exception):
    def __init__(self, reason: str, error: str) -> None:
        super().__init__(reason)
        self.reason = reason
        self.error = error


def asset_fingerprint(layout: GameLayout) -> str:
    aa = layout.data_dir / "StreamingAssets" / "aa"
    parts = [str(PORTRAIT_VERSION), layout.fingerprint()]
    if aa.is_dir():
        for path in sorted(aa.rglob("*.bundle")):
            stat = path.stat()
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


def _worker_count(jobs: int) -> int:
    if jobs > 0:
        return jobs
    return max(1, min(DEFAULT_JOBS, os.cpu_count() or 4))


def _load_previous(layout: GameLayout, output: Path, preview_dir: Path) -> Previous | None:
    manifest = read_json(output / "manifest.json")
    if not isinstance(manifest, dict) or manifest.get("version") != PORTRAIT_VERSION:
        return None
    fingerprint = asset_fingerprint(layout)
    if manifest.get("fingerprint") != fingerprint:
        return None
    files = manifest.get("files")
    if not isinstance(files, list) or not files or not all(
            isinstance(name, str) and Path(name).name == name for name in files):
        return None
    previews = read_json(preview_dir / "index.json")
    if not isinstance(previews, dict) or previews.get("version") != PREVIEW_VERSION:
        return None
    if previews.get("assets") != fingerprint:
        return None
    artifacts = previews.get("artifacts")
    if not isinstance(artifacts, dict) or not isinstance(previews.get("characters"), dict):
        return None
    for entry in artifacts.values():
        if not isinstance(entry, dict):
            return None
        name = entry.get("file")
        if not isinstance(name, str) or Path(name).name != name:
            return None
    return Previous(manifest, previews)


def _complete(previous: Previous, output: Path, preview_dir: Path) -> bool:
    files = previous.manifest.get("files")
    if not isinstance(files, list) or not all(
            (output / name).is_file() for name in files if isinstance(name, str)):
        return False
    artifacts = previous.previews.get("artifacts")
    if not isinstance(artifacts, dict):
        return False
    for entry in artifacts.values():
        name = entry.get("file") if isinstance(entry, dict) else None
        if not isinstance(name, str) or not (preview_dir / name).is_file():
            return False
    return True


def _reusable(previous: Previous, character: str, expression: str, override: Frame | None,
              output: Path, preview_dir: Path) -> tuple[str, str] | None:
    tables = previous.manifest.get("characters")
    table = tables.get(character) if isinstance(tables, dict) else None
    file = table.get(expression) if isinstance(table, dict) else None
    if not isinstance(file, str) or not (output / file).is_file():
        return None
    if not same_frame_value(override, frame_at(previous.manifest.get("settings"),
                                               character, expression)):
        return None
    characters = previous.previews.get("characters")
    record = characters.get(character) if isinstance(characters, dict) else None
    entries = record.get("expressions") if isinstance(record, dict) else None
    artifact = entries.get(expression) if isinstance(entries, dict) else None
    if not isinstance(artifact, str):
        return None
    previews = previous.previews.get("artifacts")
    record = previews.get(artifact) if isinstance(previews, dict) else None
    if not isinstance(record, dict):
        return None
    name = record.get("file")
    if not isinstance(name, str) or not (preview_dir / name).is_file():
        return None
    return file, artifact


def _fallbacks(previous: Previous | None, output: Path, preview_dir: Path) \
        -> dict[tuple[str, str], tuple[str, str]]:
    result: dict[tuple[str, str], tuple[str, str]] = {}
    if previous is None:
        return result
    tables = previous.manifest.get("characters")
    previews = previous.previews.get("characters")
    artifacts = previous.previews.get("artifacts")
    if not isinstance(tables, dict) or not isinstance(previews, dict) \
            or not isinstance(artifacts, dict):
        return result
    for character, table in tables.items():
        record = previews.get(character)
        entries = record.get("expressions") if isinstance(record, dict) else None
        if not isinstance(table, dict) or not isinstance(entries, dict):
            continue
        for expression, file in table.items():
            artifact = entries.get(expression)
            stored = artifacts.get(artifact) if isinstance(artifact, str) else None
            name = stored.get("file") if isinstance(stored, dict) else None
            if not isinstance(file, str) or not (output / file).is_file():
                continue
            if not isinstance(name, str) or not (preview_dir / name).is_file():
                continue
            result[(character, expression)] = (file, artifact)
    return result


def _plan(characters: dict[str, dict[str, str]], index: dict[str, Path],
          frames: dict[str, dict[str, Frame]], previous: Previous | None,
          output: Path, preview_dir: Path) -> Plan:
    grouped: dict[Path, dict[str, list[Target]]] = {}
    missing: list[dict] = []
    images: dict[tuple[str, str], str] = {}
    artifacts: dict[tuple[str, str], str] = {}
    for character, expressions in sorted(characters.items()):
        table = frames.get(character, {})
        for expression, address in sorted(expressions.items()):
            bundle = index.get(address)
            if bundle is None:
                missing.append({"character": character, "expression": expression,
                                "address": address})
                continue
            override = table.get(expression)
            if previous is not None:
                reused = _reusable(previous, character, expression, override,
                                   output, preview_dir)
                if reused is not None:
                    images[(character, expression)] = reused[0]
                    artifacts[(character, expression)] = reused[1]
                    continue
            entry = grouped.setdefault(bundle, {}).setdefault(address, [])
            entry.append((character, expression, override))
    return Plan(grouped, missing, images, artifacts,
                _fallbacks(previous, output, preview_dir))


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
    index: dict[str, Path] = {}
    for file in sorted(bundle_dir(layout).glob("*.bundle")):
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
    picture = image if image.mode == "RGBA" else image.convert("RGBA")
    bounds = picture.getchannel("A").getbbox()
    if bounds and bounds != (0, 0, *picture.size):
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

    if picture.width <= PREVIEW_MAX and picture.height <= PREVIEW_MAX:
        crop = picture
    else:
        crop = picture.copy()
        crop.thumbnail((PREVIEW_MAX, PREVIEW_MAX), Image.Resampling.LANCZOS)
    output = BytesIO()
    crop.save(output, format="WEBP", quality=PREVIEW_QUALITY, method=PREVIEW_METHOD)
    return output.getvalue()


def _artifact_key(prefix: str, address: str) -> str:
    return hashlib.sha256(f"{prefix}|{address}".encode("utf-8")).hexdigest()[:24]


def _render_address(obj: Any, artifact: str, targets: tuple[Target, ...],
                    preview_missing: bool, output: Path, preview_dir: Path) -> Render:
    try:
        image = obj.read().image
    except Exception as exc:
        raise RenderError("image_read_failed", type(exc).__name__) from exc
    picture = _picture(image)
    default = _default_frame(picture)
    name = f"{artifact}.webp"
    record = {"file": name, "size": list(picture.size), "default": default.wire()}
    errors: list[tuple[str, str, str]] = []
    if preview_missing:
        try:
            atomic_write_bytes(preview_dir / name, preview(picture))
        except Exception:
            errors.append(("", "", "preview_write_failed"))
    rendered: dict[tuple[float, float, float], str] = {}
    images: list[tuple[str, str, str]] = []
    for character, expression, frame in targets:
        active = frame or default
        key = (round(active.x, 5), round(active.y, 5), round(active.w, 5))
        digest = rendered.get(key)
        if digest is None:
            try:
                payload = avatar(picture, active)
            except Exception:
                errors.append((character, expression, "image_crop_failed"))
                continue
            digest = hashlib.sha256(payload).hexdigest()[:24] + ".webp"
            if not (output / digest).is_file():
                atomic_write_bytes(output / digest, payload)
            rendered[key] = digest
        images.append((character, expression, digest))
    return Render(images, artifact, record, errors)


def _export_images(grouped: dict[Path, dict[str, list[Target]]], output: Path,
                   preview_dir: Path, issues: list[dict], reporter: Reporter,
                   jobs: int) -> Export:
    images: dict[tuple[str, str], str] = {}
    artifact_of: dict[tuple[str, str], str] = {}
    previews: dict[str, dict] = {}
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=jobs) as executor:
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
                objects: dict[str, Any] = {}
                for address, obj in sorted(
                        env.container.items(),
                        key=lambda pair: pair[1].type.name != "Sprite"):
                    key = address.replace("\\", "/")
                    if key not in targets or key in objects:
                        continue
                    if obj.type.name not in ("Sprite", "Texture2D"):
                        continue
                    objects[key] = obj
                futures: dict[str, Future[Render]] = {}
                for key, entries in sorted(targets.items()):
                    obj = objects.get(key)
                    if obj is None:
                        issues.append({"address": key, "reason": "sprite_not_found"})
                        continue
                    artifact = _artifact_key(prefix, key)
                    missing = not (preview_dir / f"{artifact}.webp").is_file()
                    futures[key] = executor.submit(
                        _render_address, obj, artifact, tuple(entries), missing,
                        output, preview_dir)
                for key, future in futures.items():
                    try:
                        result = future.result()
                    except RenderError as exc:
                        issues.append({"address": key, "reason": exc.reason,
                                       "error": exc.error})
                        continue
                    except Exception as exc:
                        issues.append({"address": key, "reason": "render_failed",
                                       "error": type(exc).__name__})
                        continue
                    previews[result.artifact] = result.preview
                    for character, expression, digest in result.images:
                        images[(character, expression)] = digest
                        artifact_of[(character, expression)] = result.artifact
                    for character, expression, reason in result.errors:
                        entry = {"address": key, "reason": reason}
                        if character:
                            entry["character"] = character
                        if expression:
                            entry["expression"] = expression
                        issues.append(entry)
            finally:
                _dispose(env)
            if position % 20 == 0 or position == len(grouped):
                reporter.info(
                    f"portraits: {position}/{len(grouped)} bundles, {len(images)} images,"
                    f" {time.monotonic() - started:.1f}s")
    return Export(images, artifact_of, previews)


def _sweep(directory: Path, keep: set[str], suffixes: tuple[str, ...]) -> None:
    for stale in directory.iterdir():
        if not stale.is_file() or stale.suffix not in suffixes:
            continue
        if len(stale.stem) == 24 and all(char in "0123456789abcdef" for char in stale.stem) \
                and stale.name not in keep:
            stale.unlink()


def _trim_issues(issues: list[dict]) -> list[dict]:
    if len(issues) <= MAX_ISSUES:
        return issues
    return issues[:MAX_ISSUES] + [{"reason": "issues_truncated",
                                   "count": len(issues) - MAX_ISSUES}]


def export_portraits(layout: GameLayout, reporter: Reporter, *, force: bool = False,
                     output: Path = PORTRAIT_DIR, preview_dir: Path = PORTRAIT_PREVIEW_DIR,
                     labels: Mapping[str, str] | None = None, jobs: int = 0) -> dict:
    started = time.monotonic()
    workers = _worker_count(jobs)
    previous = None if force else _load_previous(layout, output, preview_dir)
    frames = load_frames()
    snapshot = settings_snapshot(frames)
    if previous is not None and same_settings_snapshot(previous.manifest.get("settings"),
                                                       snapshot) \
            and _complete(previous, output, preview_dir):
        reporter.info(f"portraits: {len(previous.manifest.get('characters', {}))}"
                      f" characters from cache")
        return previous.manifest
    fingerprint = asset_fingerprint(layout)
    cached = load_bundle_cache(layout, fingerprint)
    if cached is None:
        session = AssetSession(layout, try_build_generator(layout), reporter.info)
        try:
            characters, issues = character_expressions(session)
        finally:
            session.close()
        index = bundle_index(layout)
        save_bundle_cache(fingerprint, characters, index, issues)
    else:
        characters, index, issues = cached
    plan = _plan(characters, index, frames, previous, output, preview_dir)
    reporter.info(f"portraits: {len(plan.grouped)} bundles to render,"
                  f" {len(plan.images)} reused, {workers} threads")
    output.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    exported = _export_images(plan.grouped, output, preview_dir, issues, reporter, workers)
    images = {key: value[0] for key, value in plan.fallback.items()}
    images.update(plan.images)
    images.update(exported.images)
    artifact_of = {key: value[1] for key, value in plan.fallback.items()}
    artifact_of.update(plan.artifacts)
    artifact_of.update(exported.artifacts)
    names = labels or {}
    available: dict[str, dict[str, str]] = {}
    preview_characters: dict[str, dict] = {}
    for character, expressions in sorted(characters.items()):
        table: dict[str, str] = {}
        variants: dict[str, str] = {}
        for expression in sorted(expressions):
            key = (character, expression)
            file = images.get(key)
            artifact = artifact_of.get(key)
            if file is None or artifact is None:
                continue
            table[expression] = file
            variants[expression] = artifact
        if table:
            available[character] = table
            preview_characters[character] = {"label": names.get(character) or character,
                                             "expressions": variants}
    used = set(artifact_of.values())
    previews: dict[str, dict] = {}
    if previous is not None:
        stored = previous.previews.get("artifacts")
        if isinstance(stored, dict):
            previews.update({key: value for key, value in stored.items() if key in used})
    previews.update(exported.previews)
    previews = {key: value for key, value in previews.items() if key in used}
    files = sorted(set(images.values()))
    manifest = {
        "version": PORTRAIT_VERSION,
        "fingerprint": fingerprint,
        "size": list(THUMBNAIL_SIZE),
        "settings": snapshot,
        "characters": available,
        "files": files,
        "missing": plan.missing,
        "issues": _trim_issues(issues),
    }
    write_json(output / "manifest.json", manifest, indent=None)
    write_json(preview_dir / "index.json", {
        "version": PREVIEW_VERSION,
        "avatar": list(THUMBNAIL_SIZE),
        "head_band": HEAD_BAND,
        "assets": fingerprint,
        "settings": framing_digest(),
        "artifacts": dict(sorted(previews.items())),
        "characters": preview_characters,
    }, indent=None)
    _sweep(output, set(files), (".dds", ".webp"))
    _sweep(preview_dir, {entry["file"] for entry in previews.values()
                         if isinstance(entry.get("file"), str)}, (".webp",))
    elapsed = time.monotonic() - started
    reporter.info(
        f"portraits: {len(available)} characters, {len(files)} images,"
        f" {len(previews)} previews, {len(plan.images)} reused,"
        f" {len(exported.images)} rendered, {len(plan.grouped)} bundles,"
        f" {len(plan.missing)} missing, {len(issues)} issues, {elapsed:.1f}s")
    return manifest
