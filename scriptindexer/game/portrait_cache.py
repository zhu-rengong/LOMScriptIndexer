from pathlib import Path
from typing import Any

from ..jsonio import read_json, write_json
from ..paths import PORTRAIT_CACHE_PATH, PORTRAIT_CROP_DIR, PORTRAIT_CROP_INDEX_PATH
from .framing import Frame
from .layout import GameLayout

CACHE_VERSION = 1
CROP_VERSION = 1
FRAME_DIGITS = 5


def bundle_dir(layout: GameLayout) -> Path:
    return layout.data_dir / "StreamingAssets" / "aa" / "StandaloneWindows64"


def frame_value(frame: Frame | None) -> list[float] | None:
    if frame is None:
        return None
    return [round(frame.x, FRAME_DIGITS), round(frame.y, FRAME_DIGITS), round(frame.w, FRAME_DIGITS)]


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


def frame_at(snapshot: Any, character: str, expression: str) -> Any:
    if not isinstance(snapshot, dict):
        return None
    table = snapshot.get(character)
    if not isinstance(table, dict):
        return None
    return table.get(expression)


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


def load_bundle_cache(layout: GameLayout, fingerprint: str) \
        -> tuple[dict[str, dict[str, str]], dict[str, Path], list[dict]] | None:
    payload = read_json(PORTRAIT_CACHE_PATH)
    if not isinstance(payload, dict) or payload.get("version") != CACHE_VERSION:
        return None
    if payload.get("fingerprint") != fingerprint:
        return None
    characters = payload.get("characters")
    addresses = payload.get("addresses")
    if not isinstance(characters, dict) or not isinstance(addresses, dict) or not addresses:
        return None
    directory = bundle_dir(layout)
    index: dict[str, Path] = {}
    for address, name in addresses.items():
        if not isinstance(address, str) or not isinstance(name, str) or Path(name).name != name:
            return None
        path = directory / name
        if not path.is_file():
            return None
        index[address] = path
    parsed: dict[str, dict[str, str]] = {}
    for character, table in characters.items():
        if not isinstance(character, str) or not isinstance(table, dict):
            return None
        entries: dict[str, str] = {}
        for expression, address in table.items():
            if not isinstance(expression, str) or not isinstance(address, str):
                return None
            entries[expression] = address
        parsed[character] = entries
    issues = payload.get("issues")
    return parsed, index, issues if isinstance(issues, list) else []


def save_bundle_cache(fingerprint: str, characters: dict[str, dict[str, str]],
                      index: dict[str, Path], issues: list[dict]) -> None:
    payload = {
        "version": CACHE_VERSION,
        "fingerprint": fingerprint,
        "characters": {character: dict(sorted(table.items()))
                       for character, table in sorted(characters.items())},
        "addresses": {address: path.name for address, path in sorted(index.items())},
        "issues": list(issues),
    }
    write_json(PORTRAIT_CACHE_PATH, payload, indent=None)


def crop_file(digest: str) -> Path:
    return PORTRAIT_CROP_DIR / f"{digest}.png"


def load_crop_index(fingerprint: str) -> dict[str, dict[str, dict]] | None:
    payload = read_json(PORTRAIT_CROP_INDEX_PATH)
    if not isinstance(payload, dict) or payload.get("version") != CROP_VERSION:
        return None
    if payload.get("fingerprint") != fingerprint:
        return None
    characters = payload.get("characters")
    if not isinstance(characters, dict):
        return None
    parsed: dict[str, dict[str, dict]] = {}
    for character, table in characters.items():
        if not isinstance(character, str) or not isinstance(table, dict):
            continue
        entries: dict[str, dict] = {}
        for expression, record in table.items():
            if not isinstance(expression, str) or not isinstance(record, dict):
                continue
            address = record.get("address")
            cell = record.get("cell")
            artifact = record.get("artifact")
            if not isinstance(address, str) or not isinstance(cell, str) \
                    or not isinstance(artifact, str):
                continue
            if Path(cell).name != cell or not crop_file(cell).is_file():
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
    payload = {
        "version": CROP_VERSION,
        "fingerprint": fingerprint,
        "characters": {
            character: {expression: dict(record) for expression, record in sorted(table.items())}
            for character, table in sorted(characters.items())
        },
    }
    write_json(PORTRAIT_CROP_INDEX_PATH, payload, indent=None)
