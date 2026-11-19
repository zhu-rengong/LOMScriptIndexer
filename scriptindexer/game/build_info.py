import re
from datetime import datetime
from pathlib import Path
from typing import Any

import vdf

from ..schema import GameInfo
from .assets import AssetSession

RELEASE_TAG_PATTERN = re.compile(r"^release_(\d+(?:\.\d+)+)$")


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


def _app_state(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    try:
        parsed = vdf.loads(text)
    except (SyntaxError, ValueError):
        return {}
    state = parsed.get("AppState")
    return state if isinstance(state, dict) else {}


def read_steam_manifest(steamapps: Path, install_folder: str) -> dict[str, str | None]:
    metadata: dict[str, str | None] = {"build": None, "updated": None}
    for path in sorted(Path(steamapps).glob("appmanifest_*.acf")):
        state = _app_state(path)
        if state.get("installdir") != install_folder:
            continue
        build = str(state.get("buildid") or "")
        metadata["build"] = build if build.isdigit() else None
        stamp = str(state.get("LastUpdated") or "")
        if stamp.isdigit():
            try:
                metadata["updated"] = datetime.fromtimestamp(int(stamp)).strftime("%Y-%m-%d")
            except (OverflowError, OSError, ValueError):
                metadata["updated"] = None
        break
    return metadata


def read_build_info(session: AssetSession, steamapps: Path | None, install_folder: str) -> GameInfo:
    version = read_bundle_version(session)
    if steamapps is None:
        return GameInfo(version)
    steam = read_steam_manifest(steamapps, install_folder)
    return GameInfo(version, steam["build"], steam["updated"])
