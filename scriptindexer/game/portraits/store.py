import hashlib
from io import BytesIO
from pathlib import Path
from typing import Any

import msgspec
from PIL import Image

from ...cache import CacheCorrupted, CacheStamp, load_cache, save_cache
from ...jsonio import atomic_write_bytes, read_json
from ...paths import PORTRAIT_CACHE_PATH, PORTRAIT_CROP_INDEX_PATH
from ...schema import schema_digest
from ..framing import Frame
from ..layout import GameLayout
from .models import (
    ATLAS_CELLS,
    ATLAS_COLUMNS,
    ATLAS_METHOD,
    ATLAS_QUALITY,
    CACHE_VERSION,
    CROP_DIR,
    MAX_ISSUES,
    PORTRAIT_VERSION,
    PREVIEW_VERSION,
    THUMBNAIL_SIZE,
    Previous,
)

FRAME_DIGITS = 5


class BundleCache(msgspec.Struct):
    characters: dict[str, dict[str, str]] = msgspec.field(default_factory=dict)
    addresses: dict[str, str] = msgspec.field(default_factory=dict)
    issues: list[dict[str, Any]] = msgspec.field(default_factory=list)


class CropIndex(msgspec.Struct):
    characters: dict[str, dict[str, dict[str, Any]]] = msgspec.field(default_factory=dict)


def bundle_dir(layout: GameLayout) -> Path:
    return layout.data_dir / "StreamingAssets" / "aa" / "StandaloneWindows64"


def game_fingerprint(layout: GameLayout) -> str:
    aa = layout.data_dir / "StreamingAssets" / "aa"
    parts = [layout.fingerprint()]
    if aa.is_dir():
        for path in sorted(aa.rglob("*.bundle")):
            stat = path.stat()
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


def asset_fingerprint(game: str) -> str:
    return hashlib.sha256(f"{PORTRAIT_VERSION}|{game}".encode()).hexdigest()[:16]


def frame_value(frame: Frame | None) -> list[float] | None:
    if frame is None:
        return None
    return [
        round(frame.x, FRAME_DIGITS),
        round(frame.y, FRAME_DIGITS),
        round(frame.w, FRAME_DIGITS),
    ]


def settings_snapshot(frames: dict[str, dict[str, Frame]]) -> dict[str, dict[str, list[float]]]:
    snapshot: dict[str, dict[str, list[float]]] = {}
    for character in sorted(frames):
        entries: dict[str, list[float]] = {}
        for expression in sorted(frames[character]):
            value = frame_value(frames[character][expression])
            if value is not None:
                entries[expression] = value
        if entries:
            snapshot[character] = entries
    return snapshot


def _triplet(value: Any) -> tuple[float, float, float] | None:
    if isinstance(value, Frame):
        return (value.x, value.y, value.w)
    if isinstance(value, (list, tuple)) and len(value) == 3:
        parts: list[float] = []
        for item in value:
            if not isinstance(item, (int, float)):
                return None
            parts.append(float(item))
        return (parts[0], parts[1], parts[2])
    return None


def same_frame_value(left: Any, right: Any) -> bool:
    first = _triplet(left)
    second = _triplet(right)
    if first is None or second is None:
        return first is None and second is None
    return all(
        round(first[index], FRAME_DIGITS) == round(second[index], FRAME_DIGITS)
        for index in range(3)
    )


def same_settings_snapshot(left: Any, right: Any) -> bool:
    if not isinstance(left, dict) or not isinstance(right, dict):
        return left == right
    for character in set(left) | set(right):
        first = left.get(character)
        second = right.get(character)
        if not isinstance(first, dict) or not isinstance(second, dict):
            if first != second:
                return False
            continue
        for expression in set(first) | set(second):
            if not same_frame_value(first.get(expression), second.get(expression)):
                return False
    return True


def load_bundle_cache(
    layout: GameLayout, fingerprint: str
) -> tuple[dict[str, dict[str, str]], dict[str, Path], list[dict]] | None:
    stamp = CacheStamp(schema_digest(BundleCache), f"{CACHE_VERSION}|{fingerprint}")
    try:
        payload = load_cache(PORTRAIT_CACHE_PATH, stamp, BundleCache)
    except CacheCorrupted:
        return None
    if payload is None or not payload.addresses:
        return None
    directory = bundle_dir(layout)
    index: dict[str, Path] = {}
    for address, name in payload.addresses.items():
        if Path(name).name != name:
            return None
        path = directory / name
        if not path.is_file():
            return None
        index[address] = path
    return payload.characters, index, payload.issues


def save_bundle_cache(
    fingerprint: str,
    characters: dict[str, dict[str, str]],
    index: dict[str, Path],
    issues: list[dict],
) -> None:
    payload = BundleCache(
        characters={
            character: dict(sorted(table.items()))
            for character, table in sorted(characters.items())
        },
        addresses={address: path.name for address, path in sorted(index.items())},
        issues=list(issues),
    )
    stamp = CacheStamp(schema_digest(BundleCache), f"{CACHE_VERSION}|{fingerprint}")
    save_cache(PORTRAIT_CACHE_PATH, stamp, payload)


def crop_file(digest: str) -> Path:
    return CROP_DIR / f"{digest}.png"


def load_crop_index(fingerprint: str) -> dict[str, dict[str, dict]] | None:
    stamp = CacheStamp(schema_digest(CropIndex), f"{CACHE_VERSION}|{fingerprint}")
    try:
        payload = load_cache(PORTRAIT_CROP_INDEX_PATH, stamp, CropIndex)
    except CacheCorrupted:
        return None
    if payload is None:
        return None
    parsed: dict[str, dict[str, dict]] = {}
    for character, table in payload.characters.items():
        entries: dict[str, dict] = {}
        for expression, record in table.items():
            address = record.get("address")
            cell = record.get("cell")
            artifact = record.get("artifact")
            if not isinstance(address, str) or not isinstance(cell, str):
                continue
            if not isinstance(artifact, str) or Path(cell).name != cell:
                continue
            if not crop_file(cell).is_file():
                continue
            entries[expression] = {
                "address": address,
                "frame": record.get("frame"),
                "cell": cell,
                "artifact": artifact,
            }
        if entries:
            parsed[character] = entries
    return parsed


def save_crop_index(fingerprint: str, characters: dict[str, dict[str, dict]]) -> None:
    payload = CropIndex(
        characters={
            character: {expression: dict(record) for expression, record in sorted(table.items())}
            for character, table in sorted(characters.items())
        }
    )
    stamp = CacheStamp(schema_digest(CropIndex), f"{CACHE_VERSION}|{fingerprint}")
    save_cache(PORTRAIT_CROP_INDEX_PATH, stamp, payload)


def load_previews(preview_dir: Path, game: str) -> dict | None:
    previews = read_json(preview_dir / "index.json")
    if not isinstance(previews, dict) or previews.get("version") != PREVIEW_VERSION:
        return None
    if previews.get("assets") != game:
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
    return previews


def valid_manifest(manifest: Any, asset: str) -> bool:
    if not isinstance(manifest, dict) or manifest.get("version") != PORTRAIT_VERSION:
        return False
    if manifest.get("fingerprint") != asset or manifest.get("columns") != ATLAS_COLUMNS:
        return False
    pages = manifest.get("pages")
    if (
        not isinstance(pages, list)
        or not pages
        or not all(isinstance(name, str) and Path(name).name == name for name in pages)
    ):
        return False
    characters = manifest.get("characters")
    if not isinstance(characters, dict):
        return False
    for table in characters.values():
        if not isinstance(table, dict):
            return False
        for value in table.values():
            if not isinstance(value, list) or len(value) != 2:
                return False
            page, cell = value
            if not isinstance(page, int) or not isinstance(cell, int):
                return False
            if not 0 <= page < len(pages) or not 0 <= cell < ATLAS_CELLS:
                return False
    return True


def load_previous(output: Path, preview_dir: Path, game: str, asset: str) -> Previous | None:
    manifest = read_json(output / "manifest.json")
    valid = valid_manifest(manifest, asset)
    previews = load_previews(preview_dir, game)
    crops = load_crop_index(game)
    if not valid and previews is None and crops is None:
        return None
    document = manifest if isinstance(manifest, dict) and valid else {}
    return Previous(document, previews or {}, crops)


def complete(previous: Previous, output: Path, preview_dir: Path) -> bool:
    pages = previous.manifest.get("pages")
    if not isinstance(pages, list) or not all(
        (output / name).is_file() for name in pages if isinstance(name, str)
    ):
        return False
    artifacts = previous.previews.get("artifacts")
    if not isinstance(artifacts, dict):
        return False
    for entry in artifacts.values():
        name = entry.get("file") if isinstance(entry, dict) else None
        if not isinstance(name, str) or not (preview_dir / name).is_file():
            return False
    return True


def page_key(cells: list[str]) -> str:
    digest = hashlib.sha256(f"{PORTRAIT_VERSION}|{ATLAS_COLUMNS}|{ATLAS_CELLS}|".encode("ascii"))
    digest.update("|".join(cells).encode("ascii"))
    return digest.hexdigest()[:24]


def paginate(
    cells: dict[tuple[str, str], str],
) -> tuple[list[list[str]], dict[tuple[str, str], list[int]]]:
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


def write_page(path: Path, cells: list[str]) -> None:
    width, height = THUMBNAIL_SIZE
    rows = (len(cells) + ATLAS_COLUMNS - 1) // ATLAS_COLUMNS
    page = Image.new("RGBA", (ATLAS_COLUMNS * width, rows * height), (0, 0, 0, 0))
    try:
        for index, cell in enumerate(cells):
            crop = Image.open(crop_file(cell))
            try:
                page.paste(
                    crop, ((index % ATLAS_COLUMNS) * width, (index // ATLAS_COLUMNS) * height)
                )
            finally:
                crop.close()
        output = BytesIO()
        page.save(output, format="WEBP", quality=ATLAS_QUALITY, method=ATLAS_METHOD)
    finally:
        page.close()
    atomic_write_bytes(path, output.getvalue())


def sweep(directory: Path, keep: set[str], suffixes: tuple[str, ...]) -> None:
    for stale in directory.iterdir():
        if not stale.is_file() or stale.suffix not in suffixes:
            continue
        if (
            len(stale.stem) == 24
            and all(char in "0123456789abcdef" for char in stale.stem)
            and stale.name not in keep
        ):
            stale.unlink()


def trim_issues(issues: list[dict]) -> list[dict]:
    if len(issues) <= MAX_ISSUES:
        return issues
    return issues[:MAX_ISSUES] + [{"reason": "issues_truncated", "count": len(issues) - MAX_ISSUES}]
