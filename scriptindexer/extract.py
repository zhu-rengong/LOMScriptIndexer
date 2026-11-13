import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .cache import STAGE_ANALYSIS, CacheCorrupted, CacheStamp, analyze_all, load_cache, save_cache
from .console import Reporter
from .errors import DataError, UsageError
from .game.assets import AssetSession, try_build_generator
from .game.battle_levels import extract as extract_battles
from .game.battle_levels import summarize as summarize_battles
from .game.build_info import read_build_info
from .game.checkpoints import (
    collect_check_keys,
    collect_kind_hints,
    locate_checkpoint_assets,
)
from .game.checkpoints import (
    extract as extract_checkpoints,
)
from .game.checkpoints import (
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
from .game.lore import document as lore_document
from .game.lore import probe_legend_texts
from .game.lore import summarize as summarize_lore
from .game.missions import extract as extract_missions
from .game.missions import summarize as summarize_missions
from .game.portraits import export_portraits
from .game.scripts import ScriptCorpus, extract_scripts
from .game.stat_assets import document as stats_document
from .game.stat_assets import extract as extract_stats
from .game.stat_assets import summarize as summarize_stats
from .jsonio import atomic_write_text, write_json
from .manifest import load_manifest, manifest_matches, save_manifest
from .paths import (
    BATTLES_PATH,
    LOCALE_DIR,
    LUA_DIR,
    MANIFEST_PATH,
    MISSIONS_PATH,
    PORTRAIT_PREVIEW_DIR,
    SITE_DATA_DIR,
    STATS_PATH,
)
from .schema import (
    SOURCES,
    BattleDocument,
    CheckpointDocument,
    EntriesDocument,
    LoreDocument,
    MissionDocument,
    StatsDocument,
    save_source,
    source_version,
)
from .script_model import ScriptAnalysis

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

GENERATOR_MISSING = "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable"


@dataclass(frozen=True)
class ExtractRequest:
    game: Path | None = None
    langs: tuple[str, ...] = ()
    force: bool = False
    checkpoints: bool = True
    entries: bool = True
    lore: bool = True
    stats: bool = True
    missions: bool = True
    battles: bool = True
    portraits: bool = True
    portrait_jobs: int = 0


@dataclass(frozen=True)
class ExtractResult:
    script_count: int = 0
    langs: tuple[str, ...] = ()


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


@dataclass
class ExtractContext:
    session: AssetSession
    reporter: Reporter
    fingerprint: str
    analyses: dict[str, ScriptAnalysis] = field(default_factory=dict)
    corpus: ScriptCorpus | None = None
    locale_tables: dict[str, dict[str, dict[str, str]]] = field(default_factory=dict)


type StageRun = Callable[[ExtractContext], tuple[Any | None, dict[str, Any]]]
type StageSummary = Callable[[Any | None, dict[str, Any]], dict[str, Any]]


@dataclass(frozen=True)
class ExtractStage:
    name: str
    title: str
    source: str
    enabled: bool
    run: StageRun
    summarize: StageSummary


def _disabled(title: str, reporter: Reporter) -> dict[str, Any]:
    reporter.stage(title)
    return StageStats(enabled=False, skipped=True).to_wire()


def _run_stage(stage: ExtractStage, context: ExtractContext, force: bool) -> dict[str, Any]:
    reporter = context.reporter
    reporter.stage(stage.title)
    source = SOURCES[stage.source]
    stamp = CacheStamp(source.version, context.fingerprint)
    if not force:
        try:
            cached = load_cache(source.cache, stamp, source.model)
        except CacheCorrupted as exc:
            reporter.warn(f"{exc}; rebuilding {stage.source}")
            cached = None
        if cached is not None:
            save_source(stage.source, cached)
            values = stage.summarize(cached, {"elapsed": 0.0})
            reporter.info(f"{values.get('summary', stage.source)} (cache)")
            return StageStats(values=values, elapsed=0.0).to_wire()
    started = time.time()
    document, details = stage.run(context)
    elapsed = round(time.time() - started, 1)
    details["elapsed"] = elapsed
    if document is None:
        skip = details.get("skip")
        if skip:
            reporter.warn(str(skip))
        values = stage.summarize(None, details)
        return StageStats(values=values, skipped=bool(skip), elapsed=elapsed).to_wire()
    save_cache(source.cache, stamp, document)
    save_source(stage.source, document)
    values = stage.summarize(document, details)
    return StageStats(values=values, elapsed=elapsed).to_wire()


def _summarize_checkpoints(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    items = document.items if isinstance(document, CheckpointDocument) else {}
    wanted = int(details.get("wanted") or 0)
    gaps = details.get("gaps") or []
    return summarize_checkpoints(items, wanted, gaps)


def _summarize_entries(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    values = summarize_entries(document if isinstance(document, EntriesDocument) else None)
    skip = details.get("skip")
    if skip:
        values["reason"] = str(skip)
    return values


def _summarize_stats(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    items = document.items if isinstance(document, StatsDocument) else {}
    return summarize_stats(items, float(details.get("elapsed") or 0.0))


def _summarize_missions(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    items = document.items if isinstance(document, MissionDocument) else {}
    return summarize_missions(items, float(details.get("elapsed") or 0.0))


def _summarize_battles(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    items = document.items if isinstance(document, BattleDocument) else {}
    return summarize_battles(items, float(details.get("elapsed") or 0.0))


def _summarize_lore(document: Any | None, details: dict[str, Any]) -> dict[str, Any]:
    items = document.items if isinstance(document, LoreDocument) else {}
    wanted = set(details.get("missing") or [])
    values = summarize_lore(
        wanted, items, details.get("gaps") or [], float(details.get("elapsed") or 0.0)
    )
    values["lore_keys"] = int(details.get("lore_keys") or 0)
    if details.get("unavailable"):
        values["by_reason"] = {"unavailable": len(wanted)}
    return values


def _run_checkpoints(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    check_keys = collect_check_keys(context.analyses)
    if not check_keys:
        return None, {
            "gaps": [],
            "wanted": 0,
            "skip": "no checkpoint references in the corpus, skipping",
        }
    if context.session.generator is None:
        return None, {"gaps": [], "wanted": len(check_keys), "skip": GENERATOR_MISSING}
    kind_hints = collect_kind_hints(context.analyses)
    context.reporter.info(f"scanning assets for {len(check_keys)} configs")
    located = locate_checkpoint_assets(context.session, check_keys, context.reporter)
    context.reporter.info(f"located {len(located)}/{len(check_keys)}, reading fields...")
    conditions, gaps = extract_checkpoints(context.session, located, context.reporter, kind_hints)
    document = CheckpointDocument(schema=source_version("checkpoints"), items=conditions, gaps=gaps)
    return document, {"gaps": gaps, "wanted": len(check_keys)}


def _run_entries(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    ids = set(context.corpus.scripts) if context.corpus is not None else set()
    if not ids:
        return None, {"skip": "no scripts found, skipping the position probe"}
    context.reporter.info("scanning asset files")
    document = probe_positions(context.session, ids, context.reporter)
    return document, {}


def _run_stats(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    if context.session.generator is None:
        return None, {"skip": GENERATOR_MISSING}
    try:
        items, summary = extract_stats(context.session, context.reporter)
    except Exception as exc:
        return None, {"skip": f"stat asset extraction failed: {type(exc).__name__}: {exc}"}
    return stats_document(items), {key: value for key, value in summary.items()}


def _run_missions(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    if context.session.generator is None:
        return None, {"skip": GENERATOR_MISSING}
    try:
        items, stats = extract_missions(context.session, context.reporter)
    except Exception as exc:
        return None, {"skip": f"mission asset extraction failed: {type(exc).__name__}: {exc}"}
    document = MissionDocument(schema=source_version("missions"), items=items)
    return document, {
        key: stats[key] for key in ("unresolved", "condition_gaps", "sub_missions") if key in stats
    }


def _run_battles(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    if context.session.generator is None:
        return None, {"skip": GENERATOR_MISSING}
    try:
        items, stats = extract_battles(context.session, context.reporter)
    except Exception as exc:
        return None, {"skip": f"battle level extraction failed: {type(exc).__name__}: {exc}"}
    document = BattleDocument(schema=source_version("battles"), items=items)
    return document, {
        key: stats[key] for key in ("failed", "duplicates", "unresolved_refs") if key in stats
    }


def _run_lore(context: ExtractContext) -> tuple[Any | None, dict[str, Any]]:
    keys = {key for analysis in context.analyses.values() for key in analysis.lore_keys}
    tables = context.locale_tables
    missing = {
        key
        for key in keys
        if any(key not in (tables[lang].get("LegendInfo") or {}) for lang in tables)
    }
    if not missing:
        return None, {
            "missing": [],
            "gaps": [],
            "lore_keys": len(keys),
            "skip": "every AddStory key has a LegendInfo entry",
        }
    if context.session.generator is None:
        return None, {
            "missing": sorted(missing),
            "gaps": [],
            "lore_keys": len(keys),
            "skip": GENERATOR_MISSING,
            "unavailable": True,
        }
    context.reporter.info(f"scanning assets for {len(missing)} missing LegendInfo keys")
    try:
        items, gaps = probe_legend_texts(context.session, missing, context.reporter)
    except Exception as exc:
        context.reporter.warn(f"lore probe failed: {type(exc).__name__}: {exc}")
        items = {}
        gaps = [{"key": key, "reason": "probe_error"} for key in sorted(missing)]
    return lore_document(items), {"missing": sorted(missing), "gaps": gaps, "lore_keys": len(keys)}


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


def _write_locales(
    tables: dict[str, dict[str, dict[str, str]]], langs: tuple[str, ...], reporter: Reporter
) -> tuple[dict[str, int], dict[str, int]]:
    LOCALE_DIR.mkdir(parents=True, exist_ok=True)
    story_key_counts: dict[str, int] = {}
    namespace_counts: dict[str, int] = {}
    for lang in langs:
        payload = {namespace: entries for namespace, entries in sorted(tables[lang].items())}
        write_json(LOCALE_DIR / f"{lang}.json", payload, indent=None)
        story_key_counts[lang] = len(payload.get("Story", {}))
        namespace_counts[lang] = len(payload)
        reporter.info(
            f"{lang}: {story_key_counts[lang]} Story keys"
            f" / {namespace_counts[lang]} namespaces,"
            f" {len(payload.get('Character', {}))} Character keys"
        )
    return story_key_counts, namespace_counts


def stage_versions(request: ExtractRequest) -> dict[str, str]:
    return {
        "checkpoints": source_version("checkpoints") if request.checkpoints else "0",
        "entries": source_version("entries") if request.entries else "0",
        "stats": source_version("stats") if request.stats else "0",
        "missions": source_version("missions") if request.missions else "0",
        "battles": source_version("battles") if request.battles else "0",
        "lore": source_version("lore") if request.lore else "0",
        "locale": "1",
    }


def _manifest_payload(
    layout: GameLayout,
    langs: tuple[str, ...],
    request: ExtractRequest,
    corpus: ScriptCorpus,
    story_key_counts: dict[str, int],
    locale_stats: dict[str, Any],
    namespace_counts: dict[str, int],
    stage_stats: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    return {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "game": str(layout.install_dir),
        "fingerprint": layout.fingerprint(),
        "stage_versions": stage_versions(request),
        "langs": list(langs),
        "script_count": len(corpus.scripts),
        "script_stats": corpus.stats,
        "anomalies": corpus.anomalies,
        "locale_keys": story_key_counts,
        "locale_stats": {
            **locale_stats,
            "namespaces": {lang: namespace_counts[lang] for lang in sorted(namespace_counts)},
        },
        "checkpoint_stats": stage_stats.get("checkpoints", {}),
        "entry_stats": stage_stats.get("entries", {}),
        "stat_stats": stage_stats.get("stats", {}),
        "mission_stats": stage_stats.get("missions", {}),
        "battle_stats": stage_stats.get("battles", {}),
        "lore_stats": stage_stats.get("lore", {}),
    }


def _run_extract(
    layout: GameLayout, langs: tuple[str, ...], request: ExtractRequest, reporter: Reporter
) -> ExtractResult:
    reporter.configure(EXTRACT_STAGES)
    needs_generator = (
        request.checkpoints
        or request.entries
        or request.lore
        or request.stats
        or request.missions
        or request.battles
    )
    generator = try_build_generator(layout) if needs_generator else None
    if needs_generator and generator is None:
        reporter.warn(
            "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable;"
            " condition, entry, lore, stat and mission extraction will be skipped"
        )
    fingerprint = layout.fingerprint()
    context = ExtractContext(
        session=AssetSession(layout, generator, reporter.info),
        reporter=reporter,
        fingerprint=fingerprint,
    )
    tables: dict[str, dict[str, dict[str, str]]] = {}
    try:
        reporter.stage(STAGE_SCRIPTS)
        corpus = extract_scripts(context.session, reporter)
        if not corpus.scripts:
            raise DataError("no script extracted, check the game version or UnityPy compatibility")
        context.corpus = corpus
        _write_scripts(corpus.scripts, reporter)
        context.analyses, _reused, _failed = analyze_all(
            corpus.scripts, not request.force, reporter
        )
        failed_scripts = [
            (sid, analysis.error)
            for sid, analysis in sorted(context.analyses.items())
            if analysis.error
        ]
        for sid, error in failed_scripts[:20]:
            reporter.warn(f"{sid} failed to parse: {error}")
        if len(failed_scripts) > 20:
            reporter.warn(f"{len(failed_scripts) - 20} more scripts failed to parse")
        stages = (
            ExtractStage(
                STAGE_CHECKPOINTS,
                STAGE_CHECKPOINTS,
                "checkpoints",
                request.checkpoints,
                _run_checkpoints,
                _summarize_checkpoints,
            ),
            ExtractStage(
                STAGE_ENTRIES,
                STAGE_ENTRIES,
                "entries",
                request.entries,
                _run_entries,
                _summarize_entries,
            ),
            ExtractStage(
                STAGE_STATS, STAGE_STATS, "stats", request.stats, _run_stats, _summarize_stats
            ),
            ExtractStage(
                STAGE_MISSIONS,
                STAGE_MISSIONS,
                "missions",
                request.missions,
                _run_missions,
                _summarize_missions,
            ),
            ExtractStage(
                STAGE_BATTLES,
                STAGE_BATTLES,
                "battles",
                request.battles,
                _run_battles,
                _summarize_battles,
            ),
        )
        stage_stats: dict[str, dict[str, Any]] = {}
        for stage in stages:
            if stage.enabled:
                stage_stats[stage.name] = _run_stage(stage, context, request.force)
            else:
                stage_stats[stage.name] = _disabled(stage.title, reporter)
        reporter.stage(STAGE_LOCALES)
        tables, locale_stats = extract_locales(context.session, langs, reporter)
        context.locale_tables = tables
        story_key_counts, namespace_counts = _write_locales(tables, langs, reporter)
        lore_stage = ExtractStage(
            STAGE_LORE, STAGE_LORE, "lore", request.lore, _run_lore, _summarize_lore
        )
        stage_stats["lore"] = (
            _run_stage(lore_stage, context, request.force)
            if request.lore
            else _disabled(STAGE_LORE, reporter)
        )
        build_info = read_build_info(
            context.session,
            steamapps_dir(layout.install_dir),
            install_folder_name(layout.install_dir),
        )
        if build_info.version:
            reporter.info(f"game version: v{build_info.version}")
    finally:
        context.session.close()
        generator = None

    if request.portraits:
        reporter.stage(STAGE_PORTRAITS)
        try:
            export_portraits(
                layout,
                reporter,
                force=request.force,
                labels=tables[langs[0]].get("Character"),
                jobs=request.portrait_jobs,
            )
        except Exception as exc:
            reporter.warn(f"character portraits skipped: {type(exc).__name__}: {exc}")

    save_manifest(
        MANIFEST_PATH,
        _manifest_payload(
            layout,
            langs,
            request,
            corpus,
            story_key_counts,
            locale_stats,
            namespace_counts,
            stage_stats,
        ),
    )
    reporter.blank()
    reporter.write(f"[done] {len(corpus.scripts)} scripts -> {LUA_DIR}")
    reporter.write(f"[done] stat assets -> {STATS_PATH}")
    reporter.write(f"[done] mission assets -> {MISSIONS_PATH}")
    reporter.write(f"[done] battle levels -> {BATTLES_PATH}")
    if request.portraits:
        reporter.write(f"[done] character portraits -> {SITE_DATA_DIR / 'portraits'}")
        reporter.write(f"[done] portrait previews -> {PORTRAIT_PREVIEW_DIR}")
    for lang in langs:
        reporter.write(f"[done] {lang} locale table -> {LOCALE_DIR / (lang + '.json')}")
    reporter.write(f"[done] manifest -> {MANIFEST_PATH}")
    return ExtractResult(script_count=len(corpus.scripts), langs=langs)


def run_extract(request: ExtractRequest, reporter: Reporter) -> ExtractResult:
    root = request.game if request.game is not None else game_root()
    if root is None:
        raise UsageError("no game directory given; pass --game or set MORTAL_GAME_DIR")
    layout = discover(root)
    if layout is None:
        raise UsageError(f"game data directory not found under {root}")
    langs = request.langs
    if not langs:
        raise UsageError("no language selected; pass --langs zh-tw,zh-cn")
    required = tuple(
        path
        for path, enabled in (
            (MISSIONS_PATH, request.missions),
            (BATTLES_PATH, request.battles),
        )
        if enabled
    )
    manifest = load_manifest(MANIFEST_PATH)
    if not request.force and manifest_matches(
        manifest,
        layout.fingerprint(),
        langs,
        LUA_DIR,
        LOCALE_DIR,
        stage_versions(request),
        required,
    ):
        reporter.write("[skip] resources unchanged and outputs complete; use --force to rerun")
        if request.portraits:
            export_portraits(
                layout, reporter, labels=character_labels(langs[0]), jobs=request.portrait_jobs
            )
        reporter.write(
            f"       {manifest.get('script_count')} scripts, "
            + ", ".join(
                f"{lang} {count} keys"
                for lang, count in (manifest.get("locale_keys") or {}).items()
            )
        )
        return ExtractResult(script_count=int(manifest.get("script_count") or 0), langs=langs)
    return _run_extract(layout, langs, request, reporter)


__all__ = ["ExtractRequest", "ExtractResult", "run_extract", "stage_versions"]
