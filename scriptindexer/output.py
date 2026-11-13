from pathlib import Path
from typing import Any

from .paths import SITE_DATA_DIR
from .schema import write_artifact

PRUNE_PATTERNS = ("*.json", "*.js")


def write(name: str, payload: Any, **fields: str) -> tuple[str, int]:
    return write_artifact(name, payload, **fields)


def prune(keep: set[str]) -> int:
    if not SITE_DATA_DIR.is_dir():
        return 0
    removed = 0
    for pattern in PRUNE_PATTERNS:
        for path in sorted(SITE_DATA_DIR.glob(pattern)):
            if path.name in keep:
                continue
            path.unlink()
            removed += 1
    return removed


def size_of(name: str) -> int:
    path = SITE_DATA_DIR / name
    return path.stat().st_size if path.is_file() else 0


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.2f} MB"


def data_dir() -> Path:
    return SITE_DATA_DIR
