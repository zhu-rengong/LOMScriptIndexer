import re
from datetime import datetime
from pathlib import Path

from ..schema import GameInfo
from .assets import AssetSession

ACF_FIELD_PATTERN = r'"{field}"\s+"([^"]*)"'
RELEASE_TAG_PATTERN = re.compile(r"^release_(\d+(?:\.\d+)+)$")


def _acf_value(text: str, field: str) -> str | None:
    match = re.search(ACF_FIELD_PATTERN.format(field=re.escape(field)), text)
    return match.group(1) if match else None


def read_bundle_version(session: AssetSession) -> str | None:
    found = session.find_type("PlayerSettings")
    if found is None:
        return None
    path, obj = found
    tree = session.typetree(path, obj)
    value = (tree or {}).get("bundleVersion")
    if not isinstance(value, str):
        return None
    tag = value.strip()
    match = RELEASE_TAG_PATTERN.match(tag)
    return match.group(1) if match else (tag or None)


def read_steam_manifest(steamapps: Path, install_folder: str) -> dict[str, str | None]:
    metadata: dict[str, str | None] = {"build": None, "updated": None}
    try:
        manifests = sorted(Path(steamapps).glob("appmanifest_*.acf"))
    except OSError:
        return metadata
    for path in manifests:
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if _acf_value(text, "installdir") != install_folder:
            continue
        build = _acf_value(text, "buildid")
        if build and build.isdigit():
            metadata["build"] = build
        stamp = _acf_value(text, "LastUpdated")
        if stamp and stamp.isdigit():
            try:
                metadata["updated"] = datetime.fromtimestamp(int(stamp)).strftime("%Y-%m-%d")
            except OverflowError, OSError, ValueError:
                metadata["updated"] = None
        break
    return metadata


def read_build_info(session: AssetSession, steamapps: Path | None, install_folder: str) -> GameInfo:
    version = read_bundle_version(session)
    if steamapps is None:
        return GameInfo(version)
    steam = read_steam_manifest(steamapps, install_folder)
    return GameInfo(version, steam.get("build"), steam.get("updated"))
