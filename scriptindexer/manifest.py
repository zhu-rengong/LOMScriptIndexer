from pathlib import Path

from .jsonio import read_json, write_json
from .schema.manifest import Manifest


def load_manifest(path: Path) -> Manifest | None:
    return read_json(path, Manifest)


def save_manifest(path: Path, manifest: Manifest) -> None:
    write_json(path, manifest, indent=2)


def manifest_matches(
    manifest: Manifest | None,
    fingerprint: str,
    langs: tuple[str, ...],
    lua_dir: Path,
    locale_dir: Path,
    stage_versions: dict[str, str],
    required: tuple[Path, ...] = (),
) -> bool:
    if manifest is None:
        return False
    if manifest.fingerprint != fingerprint:
        return False
    if manifest.langs != list(langs):
        return False
    if manifest.stage_versions != stage_versions:
        return False
    if not lua_dir.is_dir() or not any(lua_dir.glob("*.lua")):
        return False
    if not all((locale_dir / f"{lang}.json").exists() for lang in langs):
        return False
    return all(path.is_file() for path in required)
