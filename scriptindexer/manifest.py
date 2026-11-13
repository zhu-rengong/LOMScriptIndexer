from pathlib import Path
from typing import Any

from .jsonio import read_json, write_json


def load_manifest(path: Path) -> dict[str, Any]:
    payload = read_json(path)
    return payload if isinstance(payload, dict) else {}


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    write_json(path, manifest, indent=2)


def manifest_matches(
    manifest: dict[str, Any],
    fingerprint: str,
    langs: tuple[str, ...],
    lua_dir: Path,
    locale_dir: Path,
    stage_versions: dict[str, str],
    required: tuple[Path, ...] = (),
) -> bool:
    if not manifest or manifest.get("fingerprint") != fingerprint:
        return False
    if manifest.get("langs") != list(langs):
        return False
    if manifest.get("stage_versions") != stage_versions:
        return False
    if not lua_dir.is_dir() or not any(lua_dir.glob("*.lua")):
        return False
    if not all((locale_dir / f"{lang}.json").exists() for lang in langs):
        return False
    return all(path.is_file() for path in required)
