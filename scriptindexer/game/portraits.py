import hashlib
import os
import time
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any

from ..console import Reporter
from ..jsonio import atomic_write_bytes, read_json, write_json
from ..paths import PORTRAIT_CROP_DIR, PORTRAIT_PREVIEW_DIR, SITE_DATA_DIR
from .assets import AssetSession, _dispose, try_build_generator, unitypy
from .framing import AVATAR_SIZE, HEAD_BAND, Frame, default_frame, framing_digest, load_frames
from .layout import GameLayout
from .portrait_cache import (
    bundle_dir,
    crop_file,
    frame_value,
    load_bundle_cache,
    load_crop_index,
    same_frame_value,
    same_settings_snapshot,
    save_bundle_cache,
    save_crop_index,
    settings_snapshot,
)

PORTRAIT_VERSION = 6
PREVIEW_VERSION = 1
PORTRAIT_DIR = SITE_DATA_DIR / "portraits"
THUMBNAIL_SIZE = AVATAR_SIZE
ATLAS_COLUMNS = 16
ATLAS_ROWS = 16
ATLAS_CELLS = ATLAS_COLUMNS * ATLAS_ROWS
ATLAS_QUALITY = 85
ATLAS_METHOD = 4
PREVIEW_MAX = 1400
PREVIEW_QUALITY = 76
PREVIEW_METHOD = 1
MAX_JOBS = 4
CHUNK_SIZE = 10
MAX_ISSUES = 200

Target = tuple[str, str, Frame | None]


@dataclass(frozen=True)
class Crop:
    character: str
    expression: str
    address: str
    frame: list[float] | None
    cell: str
    artifact: str


@dataclass(frozen=True)
class Export:
    crops: list[Crop]
    previews: dict[str, dict]


@dataclass(frozen=True)
class Render:
    artifact: str
    crops: list[Crop]
    preview: dict
    errors: list[tuple[str, str, str]]


@dataclass(frozen=True)
class Previous:
    manifest: dict
    previews: dict
    crops: dict[str, dict[str, dict]] | None


@dataclass(frozen=True)
class Plan:
    grouped: dict[Path, dict[str, list[Target]]]
    missing: list[dict]
    crops: dict[tuple[str, str], dict]
    recovered: int


@dataclass(frozen=True)
class Job:
    key: str
    obj: Any
    artifact: str
    targets: tuple[Target, ...]
    preview_missing: bool


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
        return max(1, min(jobs, MAX_JOBS))
    cores = os.cpu_count() or 1
    return max(1, min(cores // 2, MAX_JOBS))


def _load_previous(layout: GameLayout, output: Path, preview_dir: Path) -> Previous | None:
    manifest = read_json(output / "manifest.json")
    if not isinstance(manifest, dict) or manifest.get("version") != PORTRAIT_VERSION:
        return None
    fingerprint = asset_fingerprint(layout)
    if manifest.get("fingerprint") != fingerprint:
        return None
    if manifest.get("columns") != ATLAS_COLUMNS:
        return None
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages or not all(
            isinstance(name, str) and Path(name).name == name for name in pages):
        return None
    characters = manifest.get("characters")
    if not isinstance(characters, dict):
        return None
    for table in characters.values():
        if not isinstance(table, dict):
            return None
        for value in table.values():
            if not isinstance(value, list) or len(value) != 2:
                return None
            page, cell = value
            if not isinstance(page, int) or not isinstance(cell, int):
                return None
            if not 0 <= page < len(pages) or not 0 <= cell < ATLAS_CELLS:
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
    return Previous(manifest, previews, load_crop_index(fingerprint))


def _complete(previous: Previous, output: Path, preview_dir: Path) -> bool:
    pages = previous.manifest.get("pages")
    if not isinstance(pages, list) or not all(
            (output / name).is_file() for name in pages if isinstance(name, str)):
        return False
    artifacts = previous.previews.get("artifacts")
    if not isinstance(artifacts, dict):
        return False
    for entry in artifacts.values():
        name = entry.get("file") if isinstance(entry, dict) else None
        if not isinstance(name, str) or not (preview_dir / name).is_file():
            return False
    return True


def _reusable(previous: Previous, character: str, expression: str, address: str,
              override: Frame | None, preview_dir: Path) -> dict | None:
    table = previous.crops.get(character) if previous.crops else None
    record = table.get(expression) if isinstance(table, dict) else None
    if not isinstance(record, dict) or record.get("address") != address:
        return None
    if not same_frame_value(override, record.get("frame")):
        return None
    cell = record.get("cell")
    artifact = record.get("artifact")
    if not isinstance(cell, str) or not crop_file(cell).is_file():
        return None
    if not isinstance(artifact, str):
        return None
    stored = previous.previews.get("artifacts")
    entry = stored.get(artifact) if isinstance(stored, dict) else None
    name = entry.get("file") if isinstance(entry, dict) else None
    if not isinstance(name, str) or not (preview_dir / name).is_file():
        return None
    return record


def _special_id(segment: str) -> str | None:
    pieces = segment.split("_")
    if len(pieces) < 3 or pieces[0] != "Special" or not pieces[1].isdigit():
        return None
    return pieces[1]


def _anchors(expressions: dict[str, str], index: dict[str, Path]) \
        -> dict[tuple[str, str], set[str]]:
    groups: dict[tuple[str, str], set[str]] = {}
    for address in expressions.values():
        if address not in index:
            continue
        parts = address.split("/")
        for depth, segment in enumerate(parts[:-1]):
            ident = _special_id(segment)
            if ident is None:
                continue
            groups.setdefault(("/".join(parts[:depth]), ident), set()).add(segment)
    return groups


def _stem_index(index: dict[str, Path]) -> dict[str, list[str]]:
    stems: dict[str, list[str]] = {}
    for address in index:
        stems.setdefault(PurePosixPath(address).stem, []).append(address)
    return stems


def _resolve(address: str, index: dict[str, Path], stems: dict[str, list[str]],
             anchors: dict[tuple[str, str], set[str]]) -> str | None:
    if address in index:
        return address
    if "/" not in address:
        matches = stems.get(PurePosixPath(address).stem) or []
        return matches[0] if len(matches) == 1 else None
    parts = address.split("/")
    for depth, segment in enumerate(parts[:-1]):
        ident = _special_id(segment)
        if ident is None:
            continue
        parent = "/".join(parts[:depth])
        tail = "/".join(parts[depth + 1:])
        matches: list[str] = []
        for folder in anchors.get((parent, ident), ()):
            candidate = f"{parent}/{folder}/{tail}" if parent else f"{folder}/{tail}"
            if candidate in index:
                matches.append(candidate)
        if len(matches) == 1:
            return matches[0]
    return None


def _plan(characters: dict[str, dict[str, str]], index: dict[str, Path],
          frames: dict[str, dict[str, Frame]], previous: Previous | None,
          preview_dir: Path) -> Plan:
    grouped: dict[Path, dict[str, list[Target]]] = {}
    missing: list[dict] = []
    crops: dict[tuple[str, str], dict] = {}
    stems = _stem_index(index)
    recovered = 0
    for character, expressions in sorted(characters.items()):
        table = frames.get(character, {})
        anchors = _anchors(expressions, index)
        for expression, address in sorted(expressions.items()):
            resolved = _resolve(address, index, stems, anchors)
            if resolved is None:
                missing.append({"character": character, "expression": expression,
                                "address": address})
                continue
            if resolved != address:
                recovered += 1
            override = table.get(expression)
            if previous is not None:
                reused = _reusable(previous, character, expression, resolved,
                                   override, preview_dir)
                if reused is not None:
                    crops[(character, expression)] = reused
                    continue
            entry = grouped.setdefault(index[resolved], {}).setdefault(resolved, [])
            entry.append((character, expression, override))
    return Plan(grouped, missing, crops, recovered)


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


def _crop_picture(picture: Any, frame: Frame) -> Any:
    from PIL import Image

    left, top, width, height = frame.box(picture.size)
    crop = picture.crop((left, top, left + width, top + height))
    crop = crop.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    return crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def _crop_digest(picture: Any) -> str:
    width, height = picture.size
    digest = hashlib.sha256(f"{width}x{height}|".encode("ascii"))
    digest.update(picture.tobytes())
    return digest.hexdigest()[:24]


def _png_bytes(picture: Any) -> bytes:
    output = BytesIO()
    picture.save(output, format="PNG")
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


def _render_address(address: str, obj: Any, artifact: str, targets: tuple[Target, ...],
                    preview_missing: bool, preview_dir: Path) -> Render:
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
    crops: list[Crop] = []
    for character, expression, frame in targets:
        active = frame or default
        key = (round(active.x, 5), round(active.y, 5), round(active.w, 5))
        digest = rendered.get(key)
        if digest is None:
            try:
                crop = _crop_picture(picture, active)
            except Exception:
                errors.append((character, expression, "image_crop_failed"))
                continue
            digest = _crop_digest(crop)
            path = crop_file(digest)
            if not path.is_file():
                atomic_write_bytes(path, _png_bytes(crop))
            rendered[key] = digest
        crops.append(Crop(character, expression, address, frame_value(frame), digest, artifact))
    return Render(artifact, crops, record, errors)


def _render_chunk(batch: tuple[Job, ...], preview_dir: Path) \
        -> list[tuple[str, Render | None, str, str]]:
    results: list[tuple[str, Render | None, str, str]] = []
    for job in batch:
        try:
            render = _render_address(job.key, job.obj, job.artifact, job.targets,
                                     job.preview_missing, preview_dir)
        except RenderError as exc:
            results.append((job.key, None, exc.reason, exc.error))
            continue
        except Exception as exc:
            results.append((job.key, None, "render_failed", type(exc).__name__))
            continue
        results.append((job.key, render, "", ""))
    return results


def _export_crops(grouped: dict[Path, dict[str, list[Target]]], preview_dir: Path,
                  issues: list[dict], reporter: Reporter, jobs: int) -> Export:
    crops: list[Crop] = []
    previews: dict[str, dict] = {}
    started = time.monotonic()
    total = len(grouped)
    targets_total = sum(len(entries) for table in grouped.values()
                        for entries in table.values())
    serial = total <= 1 and targets_total <= CHUNK_SIZE
    executor = ThreadPoolExecutor(max_workers=jobs)
    window = max(jobs, 2)
    pending: list[tuple[Any, list]] = []
    completed = 0

    def merge(chunk: list[tuple[str, Render | None, str, str]]) -> None:
        for key, render, failure, detail in chunk:
            if render is None:
                issues.append({"address": key, "reason": failure, "error": detail})
                continue
            previews[render.artifact] = render.preview
            crops.extend(render.crops)
            for character, expression, reason in render.errors:
                entry = {"address": key, "reason": reason}
                if character:
                    entry["character"] = character
                if expression:
                    entry["expression"] = expression
                issues.append(entry)

    def note() -> None:
        nonlocal completed
        completed += 1
        if completed % 20 == 0 or completed == total:
            reporter.info(
                f"portraits: {completed}/{total} bundles, {len(crops)} crops,"
                f" {time.monotonic() - started:.1f}s")

    def drain(item: tuple[Any, list]) -> None:
        env, futures = item
        for future in futures:
            try:
                merge(future.result())
            except Exception as exc:
                issues.append({"reason": "render_failed", "error": type(exc).__name__})
        _dispose(env)
        note()

    try:
        for bundle, targets in sorted(grouped.items()):
            env: Any = None
            try:
                env = unitypy().load(str(bundle))
                stat = bundle.stat()
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
            except Exception as exc:
                issues.append({"bundle": bundle.name, "reason": "bundle_read_failed",
                               "error": type(exc).__name__})
                if env is not None:
                    _dispose(env)
                note()
                continue
            prefix = f"{bundle.name}|{stat.st_size}|{stat.st_mtime_ns}"
            batch: list[Job] = []
            for key, entries in sorted(targets.items()):
                obj = objects.get(key)
                if obj is None:
                    issues.append({"address": key, "reason": "sprite_not_found"})
                    continue
                artifact = _artifact_key(prefix, key)
                missing = not (preview_dir / f"{artifact}.webp").is_file()
                batch.append(Job(key, obj, artifact, tuple(entries), missing))
            chunks = [tuple(batch[index:index + CHUNK_SIZE])
                      for index in range(0, len(batch), CHUNK_SIZE)]
            if serial:
                for chunk in chunks:
                    merge(_render_chunk(chunk, preview_dir))
                _dispose(env)
                note()
                continue
            futures = [executor.submit(_render_chunk, chunk, preview_dir)
                       for chunk in chunks]
            pending.append((env, futures))
            while len(pending) >= window:
                drain(pending.pop(0))
        while pending:
            drain(pending.pop(0))
    finally:
        executor.shutdown(wait=True)
        for item in pending:
            _dispose(item[0])
    return Export(crops, previews)


def _page_key(cells: list[str]) -> str:
    digest = hashlib.sha256(
        f"{PORTRAIT_VERSION}|{ATLAS_COLUMNS}|{ATLAS_CELLS}|".encode("ascii"))
    digest.update("|".join(cells).encode("ascii"))
    return digest.hexdigest()[:24]


def _paginate(cells: dict[tuple[str, str], str]) \
        -> tuple[list[list[str]], dict[tuple[str, str], list[int]]]:
    tables: dict[str, dict[str, str]] = {}
    for (character, expression), cell in cells.items():
        tables.setdefault(character, {})[expression] = cell
    pages: list[list[str]] = []
    positions: dict[tuple[str, str], list[int]] = {}
    current: list[str] = []
    for character in sorted(tables):
        names = sorted(tables[character])
        entries = [tables[character][name] for name in names]
        if not entries:
            continue
        if current and len(current) + len(entries) > ATLAS_CELLS:
            pages.append(current)
            current = []
        start = len(current)
        page = len(pages)
        for offset, expression in enumerate(names):
            positions[(character, expression)] = [page, start + offset]
        current.extend(entries)
        if len(current) == ATLAS_CELLS:
            pages.append(current)
            current = []
    if current:
        pages.append(current)
    return pages, positions


def _write_page(path: Path, cells: list[str]) -> None:
    from PIL import Image

    width, height = THUMBNAIL_SIZE
    rows = (len(cells) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    page = Image.new("RGBA", (ATLAS_COLUMNS * width, rows * height), (0, 0, 0, 0))
    try:
        for index, cell in enumerate(cells):
            crop = Image.open(crop_file(cell))
            try:
                page.paste(crop, ((index % ATLAS_COLUMNS) * width,
                                  (index // ATLAS_COLUMNS) * height))
            finally:
                crop.close()
        output = BytesIO()
        page.save(output, format="WEBP", quality=ATLAS_QUALITY, method=ATLAS_METHOD)
    finally:
        page.close()
    atomic_write_bytes(path, output.getvalue())


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
    plan = _plan(characters, index, frames, previous, preview_dir)
    reporter.info(f"portraits: {len(plan.grouped)} bundles to render,"
                  f" {len(plan.crops)} reused, {plan.recovered} addresses resolved,"
                  f" {workers} threads, {CHUNK_SIZE} per batch")
    output.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    PORTRAIT_CROP_DIR.mkdir(parents=True, exist_ok=True)
    exported = _export_crops(plan.grouped, preview_dir, issues, reporter, workers)
    records: dict[tuple[str, str], dict] = dict(plan.crops)
    for crop in exported.crops:
        records[(crop.character, crop.expression)] = {
            "address": crop.address,
            "frame": crop.frame,
            "cell": crop.cell,
            "artifact": crop.artifact,
        }
    cells = {key: record["cell"] for key, record in records.items()}
    pages, positions = _paginate(cells)
    page_files: list[str] = []
    for page_cells in pages:
        name = f"{_page_key(page_cells)}.webp"
        page_files.append(name)
        if not (output / name).is_file():
            _write_page(output / name, page_cells)
    names = labels or {}
    available: dict[str, dict[str, list[int]]] = {}
    preview_characters: dict[str, dict] = {}
    used: set[str] = set()
    for character, expressions in sorted(characters.items()):
        table: dict[str, list[int]] = {}
        variants: dict[str, str] = {}
        for expression in sorted(expressions):
            key = (character, expression)
            record = records.get(key)
            position = positions.get(key)
            if record is None or position is None:
                continue
            table[expression] = position
            variants[expression] = record["artifact"]
            used.add(record["artifact"])
        if table:
            available[character] = table
            preview_characters[character] = {"label": names.get(character) or character,
                                             "expressions": variants}
    previews: dict[str, dict] = {}
    if previous is not None:
        stored = previous.previews.get("artifacts")
        if isinstance(stored, dict):
            previews.update({key: value for key, value in stored.items() if key in used})
    previews.update(exported.previews)
    previews = {key: value for key, value in previews.items() if key in used}
    manifest = {
        "version": PORTRAIT_VERSION,
        "fingerprint": fingerprint,
        "size": list(THUMBNAIL_SIZE),
        "columns": ATLAS_COLUMNS,
        "pages": page_files,
        "settings": snapshot,
        "characters": available,
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
    nested: dict[str, dict[str, dict]] = {}
    for (character, expression), record in records.items():
        nested.setdefault(character, {})[expression] = record
    save_crop_index(fingerprint, nested)
    _sweep(output, set(page_files), (".dds", ".webp"))
    _sweep(PORTRAIT_CROP_DIR, set(cells.values()), (".png",))
    _sweep(preview_dir, {entry["file"] for entry in previews.values()
                         if isinstance(entry.get("file"), str)}, (".webp",))
    elapsed = time.monotonic() - started
    reporter.info(
        f"portraits: {len(available)} characters, {len(page_files)} pages,"
        f" {len(previews)} previews, {len(plan.crops)} reused,"
        f" {len(exported.crops)} rendered, {len(plan.grouped)} bundles,"
        f" {len(plan.missing)} missing, {len(issues)} issues, {elapsed:.1f}s")
    return manifest
