import hashlib
import os
from dataclasses import dataclass
from pathlib import Path

GAME_ENV = "MORTAL_GAME_DIR"
UNITY_VERSION_FALLBACK = "2020.3.49f1"
DATA_SUFFIX = "_Data"
GLOBAL_METADATA_FILE = "globalgamemanagers"


def game_root() -> Path | None:
    raw = os.environ.get(GAME_ENV, "").strip()
    return Path(raw).expanduser() if raw else None


def _is_serialized_asset(path: Path) -> bool:
    if not path.is_file():
        return False
    if path.suffix == ".assets" or path.name == GLOBAL_METADATA_FILE:
        return True
    return path.suffix == "" and path.name.startswith("level")


def _data_dir(root: Path) -> Path | None:
    base = Path(root)
    if base.name.endswith(DATA_SUFFIX) and base.is_dir():
        return base
    if not base.is_dir():
        return None
    candidates = sorted(
        path for path in base.iterdir() if path.is_dir() and path.name.endswith(DATA_SUFFIX)
    )
    return candidates[0] if candidates else None


@dataclass(frozen=True)
class GameLayout:
    data_dir: Path
    files: tuple[Path, ...]

    @property
    def install_dir(self) -> Path:
        return self.data_dir.parent

    def fingerprint(self) -> str:
        parts = []
        for path in self.files:
            try:
                stat = path.stat()
            except OSError:
                continue
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
        return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]


def discover(root: Path | None) -> GameLayout | None:
    if root is None:
        return None
    data_dir = _data_dir(Path(root).expanduser())
    if data_dir is None:
        return None
    files = tuple(path for path in sorted(data_dir.iterdir()) if _is_serialized_asset(path))
    if not files:
        return None
    return GameLayout(data_dir, files)


def steamapps_dir(root: Path) -> Path | None:
    for parent in Path(root).parents:
        if parent.name.lower() == "steamapps":
            return parent
    return None


def install_folder_name(root: Path) -> str:
    return Path(root).name
