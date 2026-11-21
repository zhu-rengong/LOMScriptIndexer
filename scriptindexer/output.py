from collections.abc import Iterable
from typing import Any

from .paths import SITE_DATA_DIR
from .schema import write_artifact


def write(name: str, payload: Any, **fields: str) -> tuple[str, int]:
    return write_artifact(name, payload, **fields)


def stale(keep: set[str]) -> list[str]:
    if not SITE_DATA_DIR.is_dir():
        return []
    names: list[str] = []
    for pattern in ("*.json", "*.js"):
        for path in sorted(SITE_DATA_DIR.glob(pattern)):
            if path.name not in keep:
                names.append(path.name)
    return names


def prune(names: Iterable[str]) -> int:
    removed = 0
    for name in names:
        target = SITE_DATA_DIR / name
        if not target.is_file():
            continue
        target.unlink()
        removed += 1
    return removed


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.2f} MB"
