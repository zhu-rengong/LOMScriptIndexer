from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ...paths import PORTRAIT_CROP_DIR, PORTRAIT_PREVIEW_DIR, SITE_DATA_DIR
from ..framing import AVATAR_SIZE, Frame

PORTRAIT_VERSION = 7
PREVIEW_VERSION = 1
CACHE_VERSION = 2
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
CROP_DIR = PORTRAIT_CROP_DIR
PREVIEW_DIR = PORTRAIT_PREVIEW_DIR

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
