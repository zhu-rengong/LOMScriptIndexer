import hashlib
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .analysis_cache import STAGE_ANALYSIS, analyze_all
from .cache import CacheStamp, load_json_stamp, save_json_stamp
from .console import Reporter
from .game.assets import AssetSession, try_build_generator
from .game.battle_levels import extract as extract_battles
from .game.battle_levels import summarize as summarize_battles
from .game.build_info import read_build_info
from .game.checkpoints import (
    collect_check_keys,
    collect_kind_hints,
    extract as extract_checkpoints,
    locate_checkpoint_assets,
    summarize as summarize_checkpoints,
)
from .game.entries import probe_positions
from .game.entries import summarize as summarize_entries
from .game.layout import (
    GameLayout,
    discover,
    game_root,
    install_folder_name,
    steamapps_dir,
)
from .game.locale_tables import character_labels, extract_locales
from .game.lore import probe_legend_texts
from .game.missions import extract as extract_missions
from .game.missions import summarize as summarize_missions
from .game.portraits import export_portraits
from .game.lore import summarize as summarize_lore
from .game.scripts import ScriptCorpus, extract_scripts
from .game.stat_assets import extract as extract_stats
from .game.stat_assets import summarize as summarize_stats
from .jsonio import atomic_write_text, write_json
from .manifest import load_manifest, manifest_matches, save_manifest
from .paths import (
    BATTLES_CACHE_PATH,
    BATTLES_PATH,
    CHECKPOINT_CACHE_PATH,
    CHECKPOINTS_PATH,
    ENTRY_CACHE_PATH,
    ENTRIES_PATH,
    LORE_CACHE_PATH,
    LORE_PATH,
    LOCALE_DIR,
    LUA_DIR,
    MANIFEST_PATH,
    MISSIONS_CACHE_PATH,
    MISSIONS_PATH,
    PORTRAIT_PREVIEW_DIR,
    SITE_DATA_DIR,
    STATS_CACHE_PATH,
    STATS_PATH,
)
from .versions import (
    BATTLE_VERSION,
    CHECKPOINT_VERSION,
    ENTRY_VERSION,
    LOCALE_VERSION,
    LORE_VERSION,
    MISSION_VERSION,
    SCHEMA_VERSION,
    STAT_VERSION,
)

STATUS_OK = "ok"
STATUS_USAGE = "usage"
STATUS_DATA_ERROR = "data"

STAGE_SCRIPTS = "scripts"
STAGE_CHECKPOINTS = "checkpoint conditions"
STAGE_ENTRIES = "system entries"
STAGE_STATS = "stat assets"
STAGE_MISSIONS = "mission assets"
STAGE_BATTLES = "battle levels"
STAGE_LOCALES = "locale tables"
STAGE_LORE = "lore texts"
STAGE_PORTRAITS = "character portraits"

EXTRACT_STAGES = (
    STAGE_SCRIPTS,
    STAGE_ANALYSIS,
    STAGE_CHECKPOINTS,
    STAGE_ENTRIES,
    STAGE_STATS,
    STAGE_MISSIONS,
    STAGE_BATTLES,
    STAGE_LOCALES,
    STAGE_LORE,
    STAGE_PORTRAITS,
)

GENERATOR_MISSING = (
    "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable"
)


@dataclass(frozen=True)
class ExtractRequest:
    game: Path | None
    langs: tuple[str, ...]
    force: bool = False
    with_checkpoints: bool = True
    with_entries: bool = True
    with_lore: bool = True
    with_stats: bool = True
    with_missions: bool = True
    with_battles: bool = True
    with_portraits: bool = True
    portrait_jobs: int = 0


@dataclass(frozen=True)
class ExtractResult:
    status: str
    reason: str = ""
    script_count: int = 0
    langs: tuple[str, ...] = ()

    @property
    def ok(self) -> bool:
        return self.status == STATUS_OK


@dataclass
class StageStats:
    values: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    skipped: bool = False
    elapsed: float = 0.0
    warnings: tuple[str, ...] = ()

    def to_wire(self) -> dict[str, Any]:
        out: dict[str, Any] = {"enabled": self.enabled, "skipped": self.skipped}
        out.update(self.values)
        out["elapsed"] = round(self.elapsed, 1)
        if self.warnings:
            out["warnings"] = list(self.warnings)
        return out


type StageRun = Callable[[], tuple[dict[str, Any], dict[str, Any]]]
type StageSummarize = Callable[[dict[str, Any], dict[str, Any]], StageStats]
type StageWriteArtifact = Callable[[dict[str, Any], dict[str, Any]], None]
type StageNote = Callable[[StageStats], str]


@dataclass(frozen=True)
class Stage:
    title: str
    version: int
    cache_path: Path
    fingerprint: str
    run: StageRun
    summarize: StageSummarize
    write_artifact: StageWriteArtifact
    note: StageNote


def _write_versioned(path: Path, version: int, payload: dict[str, Any],
                     extra: dict[str, Any] | None = None) -> None:
    document: dict[str, Any] = {"version": version, "items": payload}
    if extra:
        document.update(extra)
    write_json(path, document, indent=None)


def _cache_note(stats: StageStats, key: str) -> str:
    return f"{stats.values.get(key, 0)} {key} from cache"


def _run_stage(stage: Stage, force: bool, reporter: Reporter) -> dict[str, Any]:
    reporter.stage(stage.title)
    stamp = CacheStamp(stage.version, stage.fingerprint)
    cached = None if force else load_json_stamp(stage.cache_path, stamp)
    if isinstance(cached, dict):
        payload = cached.get("items")
        details = cached.get("extra")
        payload_map = payload if isinstance(payload, dict) else {}
        detail_map = details if isinstance(details, dict) else {}
        stats = stage.summarize(payload_map, detail_map)
        stage.write_artifact(payload_map, detail_map)
        reporter.info(stage.note(stats))
        return stats.to_wire()

    started = time.time()
    payload, details = stage.run()
    details["elapsed"] = round(time.time() - started, 1)
    stats = stage.summarize(payload, details)
    skip = details.get("skip")
    if skip:
        reporter.warn(str(skip))
    else:
        save_json_stamp(stage.cache_path, stamp, {"items": payload, "extra": details})
    stage.write_artifact(payload, details)
    return stats.to_wire()


def _disabled_stage(reporter: Reporter, title: str) -> dict[str, Any]:
    reporter.stage(title)
    return StageStats(enabled=False, skipped=True).to_wire()


def _checkpoint_stage(session: AssetSession, analyses: dict[str, Any],
                      reporter: Reporter, fingerprint: str) -> Stage:
    check_keys = collect_check_keys(analyses)
    kind_hints = collect_kind_hints(analyses)

    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if not check_keys:
            return {}, {"gaps": [],
                        "skip": "no checkpoint references in the corpus, skipping"}
        if session.generator is None:
            return {}, {"gaps": [], "skip": GENERATOR_MISSING}
        reporter.info(f"scanning assets for {len(check_keys)} configs")
        located = locate_checkpoint_assets(session, check_keys, reporter)
        reporter.info(f"located {len(located)}/{len(check_keys)}, reading fields...")
        conditions, gaps = extract_checkpoints(session, located, reporter, kind_hints)
        return conditions, {"gaps": gaps}

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        values = summarize_checkpoints(payload, len(check_keys), details.get("gaps") or [])
        return StageStats(
            values=values,
            skipped=bool(details.get("skip")),
            elapsed=float(details.get("elapsed") or 0.0),
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        _write_versioned(CHECKPOINTS_PATH, CHECKPOINT_VERSION, payload,
                         {"gaps": details.get("gaps") or []})

    def note(stats: StageStats) -> str:
        kinds = stats.values.get("by_kind") or {}
        detail = ", ".join(f"{kind} {count}" for kind, count in kinds.items())
        return f"{stats.values.get('resolved', 0)} from cache" + (
            f" ({detail})" if detail else "")

    return Stage(
        title=STAGE_CHECKPOINTS,
        version=CHECKPOINT_VERSION,
        cache_path=CHECKPOINT_CACHE_PATH,
        fingerprint=fingerprint,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=note,
    )


def _position_stage(session: AssetSession, ids: set[str], reporter: Reporter,
                    fingerprint: str) -> Stage:
    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if not ids:
            return {}, {"skip": "no scripts found, skipping the position probe"}
        reporter.info("scanning asset files")
        return probe_positions(session, ids, reporter), {}

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        values = summarize_entries(payload)
        skip = details.get("skip")
        if skip:
            values["reason"] = str(skip)
        return StageStats(
            values=values,
            skipped=bool(skip),
            elapsed=float(values.get("elapsed") or 0.0),
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        write_json(ENTRIES_PATH, payload or {}, indent=None)

    return Stage(
        title=STAGE_ENTRIES,
        version=ENTRY_VERSION,
        cache_path=ENTRY_CACHE_PATH,
        fingerprint=fingerprint,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=lambda stats: (
            f"{stats.values.get('positions', 0)} position events from cache"
        ),
    )


def _stat_stage(session: AssetSession, reporter: Reporter, fingerprint: str) -> Stage:
    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if session.generator is None:
            return {}, {"skip": GENERATOR_MISSING}
        try:
            payload, _summary = extract_stats(session, reporter)
        except Exception as exc:
            return {}, {"skip": f"stat asset extraction failed: {type(exc).__name__}: {exc}"}
        return payload, {}

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        elapsed = float(details.get("elapsed") or 0.0)
        return StageStats(
            values=summarize_stats(payload, elapsed),
            skipped=bool(details.get("skip")),
            elapsed=elapsed,
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        _write_versioned(STATS_PATH, STAT_VERSION, payload)

    return Stage(
        title=STAGE_STATS,
        version=STAT_VERSION,
        cache_path=STATS_CACHE_PATH,
        fingerprint=fingerprint,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=lambda stats: _cache_note(stats, "assets"),
    )


def _mission_stage(session: AssetSession, reporter: Reporter, fingerprint: str) -> Stage:
    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if session.generator is None:
            return {}, {"skip": GENERATOR_MISSING}
        try:
            payload, stats = extract_missions(session, reporter)
        except Exception as exc:
            return {}, {"skip": f"mission asset extraction failed: {type(exc).__name__}: {exc}"}
        details = {
            key: stats[key]
            for key in ("unresolved", "condition_gaps", "sub_missions")
            if key in stats
        }
        return payload, details

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        elapsed = float(details.get("elapsed") or 0.0)
        values = summarize_missions(payload, elapsed)
        for key in ("unresolved", "condition_gaps", "sub_missions"):
            if key in details:
                values[key] = details[key]
        return StageStats(
            values=values,
            skipped=bool(details.get("skip")),
            elapsed=elapsed,
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        _write_versioned(MISSIONS_PATH, MISSION_VERSION, payload)

    return Stage(
        title=STAGE_MISSIONS,
        version=MISSION_VERSION,
        cache_path=MISSIONS_CACHE_PATH,
        fingerprint=fingerprint,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=lambda stats: _cache_note(stats, "missions"),
    )


def _battle_stage(session: AssetSession, reporter: Reporter, fingerprint: str) -> Stage:
    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if session.generator is None:
            return {}, {"skip": GENERATOR_MISSING}
        try:
            payload, stats = extract_battles(session, reporter)
        except Exception as exc:
            return {}, {"skip": f"battle level extraction failed: {type(exc).__name__}: {exc}"}
        details = {key: stats[key] for key in ("failed", "duplicates", "unresolved_refs")
                   if key in stats}
        return payload, details

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        elapsed = float(details.get("elapsed") or 0.0)
        values = summarize_battles(payload, elapsed)
        for key in ("failed", "duplicates", "unresolved_refs"):
            if key in details:
                values[key] = details[key]
        return StageStats(
            values=values,
            skipped=bool(details.get("skip")),
            elapsed=elapsed,
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        _write_versioned(BATTLES_PATH, BATTLE_VERSION, payload)

    return Stage(
        title=STAGE_BATTLES,
        version=BATTLE_VERSION,
        cache_path=BATTLES_CACHE_PATH,
        fingerprint=fingerprint,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=lambda stats: _cache_note(stats, "levels"),
    )


def _lore_stage(session: AssetSession, unresolved_lore_keys: set[str], lore_key_count: int,
                reporter: Reporter, fingerprint: str) -> Stage:
    if unresolved_lore_keys:
        key_hash = hashlib.blake2b(
            "\n".join(sorted(unresolved_lore_keys)).encode("utf-8"), digest_size=8).hexdigest()
        lore_cache_key = f"{fingerprint}:{key_hash}"
    else:
        lore_cache_key = fingerprint

    def run() -> tuple[dict[str, Any], dict[str, Any]]:
        if not unresolved_lore_keys:
            return {}, {"missing": [], "gaps": [],
                        "skip": "every AddStory key has a LegendInfo entry"}
        if session.generator is None:
            return {}, {"missing": sorted(unresolved_lore_keys), "gaps": [],
                        "skip": GENERATOR_MISSING, "unavailable": True}
        reporter.info(
            f"scanning assets for {len(unresolved_lore_keys)} missing LegendInfo keys")
        try:
            payload, gaps = probe_legend_texts(session, unresolved_lore_keys, reporter)
        except Exception as exc:
            reporter.warn(f"lore probe failed: {type(exc).__name__}: {exc}")
            payload = {}
            gaps = [
                {"key": key, "reason": "probe_error"}
                for key in sorted(unresolved_lore_keys)
            ]
        return payload, {"missing": sorted(unresolved_lore_keys), "gaps": gaps}

    def summarize(payload: dict[str, Any], details: dict[str, Any]) -> StageStats:
        elapsed = float(details.get("elapsed") or 0.0)
        wanted_keys = set(details.get("missing") or [])
        values = summarize_lore(
            wanted_keys, payload, details.get("gaps") or [], elapsed)
        values["lore_keys"] = lore_key_count
        if details.get("unavailable"):
            values["by_reason"] = {"unavailable": len(wanted_keys)}
        return StageStats(
            values=values,
            skipped=bool(details.get("skip")),
            elapsed=elapsed,
        )

    def write_artifact(payload: dict[str, Any], details: dict[str, Any]) -> None:
        _write_versioned(LORE_PATH, LORE_VERSION, payload)

    return Stage(
        title=STAGE_LORE,
        version=LORE_VERSION,
        cache_path=LORE_CACHE_PATH,
        fingerprint=lore_cache_key,
        run=run,
        summarize=summarize,
        write_artifact=write_artifact,
        note=lambda stats: (
            f"StoryData fallback: {stats.values.get('resolved', 0)} from cache"
        ),
    )


def _write_scripts(scripts: dict[str, str], reporter: Reporter) -> None:
    LUA_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in sorted(scripts.items()):
        atomic_write_text(LUA_DIR / f"{name}.lua", text)
    stale = 0
    for path in LUA_DIR.glob("*.lua"):
        if path.stem not in scripts:
            path.unlink()
            stale += 1
    if stale:
        reporter.info(f"removed {stale} stale scripts")


def _write_locales(tables: dict[str, dict[str, dict[str, str]]], langs: tuple[str, ...],
                   reporter: Reporter) -> tuple[dict[str, int], dict[str, int]]:
    LOCALE_DIR.mkdir(parents=True, exist_ok=True)
    story_key_counts: dict[str, int] = {}
    namespace_counts: dict[str, int] = {}
    for lang in langs:
        payload = {
            namespace: entries for namespace, entries in sorted(tables[lang].items())
        }
        write_json(LOCALE_DIR / f"{lang}.json", payload, indent=None)
        story_key_counts[lang] = len(payload.get("Story", {}))
        namespace_counts[lang] = len(payload)
        reporter.info(
            f"{lang}: {story_key_counts[lang]} Story keys"
            f" / {namespace_counts[lang]} namespaces,"
            f" {len(payload.get('Character', {}))} Character keys"
        )
    return story_key_counts, namespace_counts


def _stage_versions(request: ExtractRequest) -> dict[str, int]:
    return {
        "checkpoints": CHECKPOINT_VERSION if request.with_checkpoints else 0,
        "entries": ENTRY_VERSION if request.with_entries else 0,
        "stats": STAT_VERSION if request.with_stats else 0,
        "missions": MISSION_VERSION if request.with_missions else 0,
        "battles": BATTLE_VERSION if request.with_battles else 0,
        "locale": LOCALE_VERSION,
        "lore": LORE_VERSION if request.with_lore else 0,
    }


def _manifest_payload(
    layout: GameLayout, langs: tuple[str, ...], request: ExtractRequest,
    corpus: ScriptCorpus, story_key_counts: dict[str, int],
    locale_stats: dict[str, Any], namespace_counts: dict[str, int],
    checkpoint_stats: dict[str, Any], entry_stats: dict[str, Any],
    stat_stats: dict[str, Any], mission_stats: dict[str, Any],
    battle_stats: dict[str, Any], lore_stats: dict[str, Any],
) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "game": str(layout.install_dir),
        "fingerprint": layout.fingerprint(),
        "stage_versions": _stage_versions(request),
        "langs": list(langs),
        "script_count": len(corpus.scripts),
        "script_stats": corpus.stats,
        "anomalies": corpus.anomalies,
        "locale_keys": story_key_counts,
        "locale_stats": {**locale_stats, "namespaces": {
            lang: namespace_counts[lang] for lang in sorted(namespace_counts)}},
        "checkpoint_stats": checkpoint_stats,
        "entry_stats": entry_stats,
        "stat_stats": stat_stats,
        "mission_stats": mission_stats,
        "battle_stats": battle_stats,
        "lore_stats": lore_stats,
    }


def _run_extract(layout: GameLayout, langs: tuple[str, ...], request: ExtractRequest,
                 reporter: Reporter) -> ExtractResult:
    reporter.configure(EXTRACT_STAGES)
    fingerprint = layout.fingerprint()
    needs_generator = (request.with_checkpoints or request.with_entries or request.with_lore
                       or request.with_stats or request.with_missions or request.with_battles)
    generator = try_build_generator(layout) if needs_generator else None
    if needs_generator and generator is None:
        reporter.warn(
            "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable;"
            " condition, entry, lore, stat and mission extraction will be skipped"
        )
    session = AssetSession(layout, generator, reporter.info)
    try:
        reporter.stage(STAGE_SCRIPTS)
        corpus = extract_scripts(session, reporter)
        if not corpus.scripts:
            reporter.error("no script extracted, check the game version or UnityPy compatibility")
            return ExtractResult(STATUS_DATA_ERROR, "no scripts")
        _write_scripts(corpus.scripts, reporter)

        analyses, _reused, _failed = analyze_all(
            corpus.scripts, not request.force, reporter)
        failed_scripts = [
            (sid, analysis.error) for sid, analysis in sorted(analyses.items())
            if analysis.error
        ]
        for sid, error in failed_scripts[:20]:
            reporter.warn(f"{sid} failed to parse: {error}")
        if len(failed_scripts) > 20:
            reporter.warn(f"{len(failed_scripts) - 20} more scripts failed to parse")

        checkpoint_stats = (
            _run_stage(_checkpoint_stage(session, analyses, reporter, fingerprint),
                       request.force, reporter)
            if request.with_checkpoints else _disabled_stage(reporter, STAGE_CHECKPOINTS)
        )
        entry_stats = (
            _run_stage(_position_stage(session, set(corpus.scripts), reporter, fingerprint),
                       request.force, reporter)
            if request.with_entries else _disabled_stage(reporter, STAGE_ENTRIES)
        )
        stat_stats = (
            _run_stage(_stat_stage(session, reporter, fingerprint), request.force, reporter)
            if request.with_stats else _disabled_stage(reporter, STAGE_STATS)
        )
        mission_stats = (
            _run_stage(_mission_stage(session, reporter, fingerprint), request.force, reporter)
            if request.with_missions else _disabled_stage(reporter, STAGE_MISSIONS)
        )
        battle_stats = (
            _run_stage(_battle_stage(session, reporter, fingerprint), request.force, reporter)
            if request.with_battles else _disabled_stage(reporter, STAGE_BATTLES)
        )

        reporter.stage(STAGE_LOCALES)
        tables, locale_stats = extract_locales(session, langs, reporter)
        story_key_counts, namespace_counts = _write_locales(tables, langs, reporter)

        lore_keys = {
            key for analysis in analyses.values() for key in analysis.lore_keys
        }
        unresolved_lore_keys = {
            key for key in lore_keys
            if any(key not in (tables[lang].get("LegendInfo") or {}) for lang in langs)
        }
        lore_stats = (
            _run_stage(
                _lore_stage(session, unresolved_lore_keys, len(lore_keys),
                            reporter, fingerprint),
                request.force, reporter)
            if request.with_lore else _disabled_stage(reporter, STAGE_LORE)
        )

        build_info = read_build_info(
            session, steamapps_dir(layout.install_dir),
            install_folder_name(layout.install_dir))
        if build_info.version:
            reporter.info(f"game version: v{build_info.version}")
    finally:
        session.close()
        generator = None

    if request.with_portraits:
        reporter.stage(STAGE_PORTRAITS)
        try:
            export_portraits(layout, reporter, force=request.force,
                             labels=tables[langs[0]].get("Character"),
                             jobs=request.portrait_jobs)
        except Exception as exc:
            reporter.warn(f"character portraits skipped: {type(exc).__name__}: {exc}")

    save_manifest(
        MANIFEST_PATH,
        _manifest_payload(
            layout, langs, request, corpus, story_key_counts, locale_stats,
            namespace_counts, checkpoint_stats, entry_stats, stat_stats,
            mission_stats, battle_stats, lore_stats),
    )
    reporter.blank()
    reporter.write(f"[done] {len(corpus.scripts)} scripts -> {LUA_DIR}")
    reporter.write(f"[done] stat assets -> {STATS_PATH}")
    reporter.write(f"[done] mission assets -> {MISSIONS_PATH}")
    reporter.write(f"[done] battle levels -> {BATTLES_PATH}")
    if request.with_portraits:
        reporter.write(f"[done] character portraits -> {SITE_DATA_DIR / 'portraits'}")
        reporter.write(f"[done] portrait previews -> {PORTRAIT_PREVIEW_DIR}")
    for lang in langs:
        reporter.write(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    reporter.write(f"[done] manifest -> {MANIFEST_PATH}")
    return ExtractResult(STATUS_OK, script_count=len(corpus.scripts), langs=langs)


def run_extract(request: ExtractRequest, reporter: Reporter) -> ExtractResult:
    root = request.game if request.game is not None else game_root()
    if root is None:
        reporter.error("no game directory given; pass --game or set the game directory env var")
        return ExtractResult(STATUS_USAGE, "game directory missing")
    layout = discover(root)
    if layout is None:
        reporter.error(f"game data directory not found under {root}")
        return ExtractResult(STATUS_USAGE, "game assets missing")
    langs = request.langs
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw,zh-cn")
        return ExtractResult(STATUS_USAGE, "no language")

    required = tuple(
        path for path, enabled in (
            (MISSIONS_PATH, request.with_missions),
            (BATTLES_PATH, request.with_battles),
        ) if enabled
    )
    manifest = load_manifest(MANIFEST_PATH)
    if not request.force and manifest_matches(
            manifest, layout.fingerprint(), langs, LUA_DIR, LOCALE_DIR,
            _stage_versions(request), required):
        reporter.write("[skip] resources unchanged and outputs complete; use --force to rerun")
        if request.with_portraits:
            export_portraits(layout, reporter, labels=character_labels(langs[0]),
                             jobs=request.portrait_jobs)
        reporter.write(
            f"       {manifest.get('script_count')} scripts, "
            + ", ".join(f"{lang} {count} keys"
                        for lang, count in (manifest.get("locale_keys") or {}).items()))
        return ExtractResult(
            STATUS_OK, script_count=int(manifest.get("script_count") or 0), langs=langs)

    return _run_extract(layout, langs, request, reporter)


__all__ = ["ExtractRequest", "ExtractResult", "run_extract"]
