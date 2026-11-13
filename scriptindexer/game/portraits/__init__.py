import os
import time
from collections.abc import Mapping
from pathlib import Path

from ...console import Reporter
from ...jsonio import write_json
from ..assets import AssetSession, _dispose, try_build_generator, unitypy
from ..framing import HEAD_BAND, framing_digest, load_frames
from ..layout import GameLayout
from .models import (
    ATLAS_COLUMNS,
    CROP_DIR,
    MAX_JOBS,
    PORTRAIT_DIR,
    PORTRAIT_VERSION,
    PREVIEW_DIR,
    PREVIEW_VERSION,
    THUMBNAIL_SIZE,
)
from .plan import character_expressions, plan_crops
from .runner import export_crops
from .store import (
    asset_fingerprint,
    bundle_dir,
    complete,
    game_fingerprint,
    load_bundle_cache,
    load_previous,
    page_key,
    paginate,
    same_settings_snapshot,
    save_bundle_cache,
    save_crop_index,
    settings_snapshot,
    sweep,
    trim_issues,
    write_page,
)

__all__ = ["export_portraits", "character_expressions"]


def _worker_count(jobs: int) -> int:
    if jobs > 0:
        return max(1, min(jobs, MAX_JOBS))
    cores = os.cpu_count() or 1
    return max(1, min(cores // 2, MAX_JOBS))


def _bundle_index(layout: GameLayout, reporter: Reporter) -> dict[str, Path]:
    index: dict[str, Path] = {}
    files = sorted(bundle_dir(layout).glob("*.bundle"))
    started = time.monotonic()
    for number, file in enumerate(files, 1):
        try:
            env = unitypy().load(str(file))
        except Exception:
            env = None
        if env is not None:
            try:
                for address in env.container:
                    index.setdefault(address.replace("\\", "/"), file)
            finally:
                _dispose(env)
        if number % 25 == 0 or number == len(files):
            reporter.info(
                f"portraits: indexed {number}/{len(files)} bundles,"
                f" {time.monotonic() - started:.1f}s"
            )
    return index


def export_portraits(
    layout: GameLayout,
    reporter: Reporter,
    *,
    force: bool = False,
    output: Path = PORTRAIT_DIR,
    preview_dir: Path = PREVIEW_DIR,
    labels: Mapping[str, str] | None = None,
    jobs: int = 0,
) -> dict:
    started = time.monotonic()
    workers = _worker_count(jobs)
    game = game_fingerprint(layout)
    asset = asset_fingerprint(game)
    previous = None if force else load_previous(output, preview_dir, game, asset)
    frames = load_frames()
    snapshot = settings_snapshot(frames)
    if (
        previous is not None
        and previous.manifest.get("version") == PORTRAIT_VERSION
        and previous.manifest.get("fingerprint") == asset
        and same_settings_snapshot(previous.manifest.get("settings"), snapshot)
        and complete(previous, output, preview_dir)
    ):
        reporter.info(
            f"portraits: {len(previous.manifest.get('characters', {}))} characters from cache"
        )
        return previous.manifest
    cached = load_bundle_cache(layout, game)
    if cached is None:
        session = AssetSession(layout, try_build_generator(layout), reporter.info)
        try:
            characters, issues = character_expressions(session)
        finally:
            session.close()
        index = _bundle_index(layout, reporter)
        save_bundle_cache(game, characters, index, issues)
    else:
        characters, index, issues = cached
    plan = plan_crops(characters, index, frames, previous, preview_dir)
    reporter.info(
        f"portraits: {len(plan.grouped)} bundles to render,"
        f" {len(plan.crops)} reused, {plan.recovered} addresses resolved,"
        f" {workers} threads"
    )
    output.mkdir(parents=True, exist_ok=True)
    preview_dir.mkdir(parents=True, exist_ok=True)
    CROP_DIR.mkdir(parents=True, exist_ok=True)
    force_previews = previous is None or not previous.previews
    exported = export_crops(plan.grouped, preview_dir, issues, reporter, workers, force_previews)
    records: dict[tuple[str, str], dict] = dict(plan.crops)
    for crop in exported.crops:
        records[(crop.character, crop.expression)] = {
            "address": crop.address,
            "frame": crop.frame,
            "cell": crop.cell,
            "artifact": crop.artifact,
        }
    cells = {key: record["cell"] for key, record in records.items()}
    pages, positions = paginate(cells)
    page_files: list[str] = []
    for page_cells in pages:
        name = f"{page_key(page_cells)}.webp"
        page_files.append(name)
        if not (output / name).is_file():
            write_page(output / name, page_cells)
    names = labels or {}
    available: dict[str, dict[str, list[int]]] = {}
    preview_characters: dict[str, dict] = {}
    used: set[str] = set()
    for character, expressions in sorted(characters.items()):
        table: dict[str, list[int]] = {}
        variants: dict[str, str] = {}
        for expression in sorted(expressions):
            key = (character, expression)
            record = records.get(key)
            position = positions.get(key)
            if record is None or position is None:
                continue
            table[expression] = position
            variants[expression] = record["artifact"]
            used.add(record["artifact"])
        if table:
            available[character] = table
            preview_characters[character] = {
                "label": names.get(character) or character,
                "expressions": variants,
            }
    previews: dict[str, dict] = {}
    if previous is not None:
        stored = previous.previews.get("artifacts")
        if isinstance(stored, dict):
            previews.update({key: value for key, value in stored.items() if key in used})
    previews.update(exported.previews)
    previews = {key: value for key, value in previews.items() if key in used}
    manifest = {
        "version": PORTRAIT_VERSION,
        "fingerprint": asset,
        "size": list(THUMBNAIL_SIZE),
        "columns": ATLAS_COLUMNS,
        "pages": page_files,
        "settings": snapshot,
        "characters": available,
        "missing": plan.missing,
        "issues": trim_issues(issues),
    }
    write_json(output / "manifest.json", manifest, indent=None)
    write_json(
        preview_dir / "index.json",
        {
            "version": PREVIEW_VERSION,
            "avatar": list(THUMBNAIL_SIZE),
            "head_band": HEAD_BAND,
            "assets": game,
            "settings": framing_digest(),
            "artifacts": dict(sorted(previews.items())),
            "characters": preview_characters,
        },
        indent=None,
    )
    nested: dict[str, dict[str, dict]] = {}
    for (character, expression), record in records.items():
        nested.setdefault(character, {})[expression] = record
    save_crop_index(game, nested)
    sweep(output, set(page_files), (".dds", ".webp"))
    sweep(CROP_DIR, {f"{cell}.png" for cell in cells.values()}, (".png",))
    sweep(
        preview_dir,
        {entry["file"] for entry in previews.values() if isinstance(entry.get("file"), str)},
        (".webp",),
    )
    elapsed = time.monotonic() - started
    reporter.info(
        f"portraits: {len(available)} characters, {len(page_files)} pages,"
        f" {len(previews)} previews, {len(plan.crops)} reused,"
        f" {len(exported.crops)} rendered, {len(plan.grouped)} bundles,"
        f" {len(plan.missing)} missing, {len(issues)} issues, {elapsed:.1f}s"
    )
    return manifest
