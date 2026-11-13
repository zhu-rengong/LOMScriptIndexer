import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import msgspec

from .. import vocab
from ..cache import STAGE_ANALYSIS, analyze_all
from ..calendar import date_parts_of
from ..console import Reporter
from ..game.assets import AssetSession
from ..game.build_info import read_build_info
from ..game.entries import summarize as summarize_probe
from ..game.layout import discover, game_root, install_folder_name, steamapps_dir
from ..game.unity_objects import count_by_reason
from ..jsonio import read_json
from ..languages import DERIVED_LANGS, TEXT_SOURCE_LANG
from ..output import format_bytes, prune, write
from ..paths import LOCALE_DIR, LUA_DIR, MANIFEST_PATH, REPORT_PATH
from ..schema import (
    ArtifactEntry,
    BattleDocument,
    CalendarInfo,
    ChapterRow,
    CheckpointDocument,
    CountsInfo,
    DataIndex,
    FlagFactsPayload,
    GameInfo,
    GraphMeta,
    GraphPayload,
    LoreDocument,
    MissionDocument,
    ShardInfo,
    StatsDocument,
    TextHeadPayload,
    TextShardPayload,
    VarReadsPayload,
    WordCountLang,
    WordCountPayload,
    artifact_paths,
    load_source,
    version_of,
)
from ..schema import (
    Facets as WireFacets,
)
from ..schema.index import contract_version
from ..script_model import Edge, ScriptAnalysis
from . import checkpoint_conditions, flag_facts, labels, load_lua_sources, var_reads
from .battle_cards import BattleCards, collect_battle_facets
from .chapters import build_chapters, chapter_id, classify
from .facets import collect_facets, merge
from .graph import (
    CollectedEdges,
    SystemEntries,
    assemble_nodes,
    build_system_entries,
    collect_edges,
    edge_rows,
    expand_positions,
    position_target_map,
)
from .report import build_report_payload, write_report
from .script_render import LanguageRender, Renderer
from .sharding import CHECKPOINT_SHARDS, pack_scripts, shard_index_by_key
from .text_metrics import TEXT_KINDS, TextCounter, add_counts, empty_counts, sum_counts

STAGE_GRAPH = "graph"
STAGE_RENDER = "render"
STAGE_OUTPUT = "output"

BUILD_STAGES = (STAGE_ANALYSIS, STAGE_GRAPH, STAGE_RENDER, STAGE_OUTPUT)

GRAPH_FIELD = "graph.json"


@dataclass(frozen=True)
class BuildResult:
    ok: bool
    scripts: int
    edges: int
    chapters: int
    languages: dict[str, Any]
    report_path: Path


@dataclass
class BuildContext:
    reporter: Reporter
    langs: tuple[str, ...]
    default_lang: str
    use_cache: bool
    jobs: int | None
    manifest: dict[str, Any] = field(default_factory=dict)
    models: dict[str, ScriptAnalysis] = field(default_factory=dict)
    node_ids: list[str] = field(default_factory=list)
    chapters: list[ChapterRow] = field(default_factory=list)
    chapter_id_by_script: dict[str, str] = field(default_factory=dict)
    chapter_index_by_script: dict[str, int] = field(default_factory=dict)
    collected: CollectedEdges | None = None
    edges: list[Edge] = field(default_factory=list)
    position_edges: list[Edge] = field(default_factory=list)
    system: SystemEntries | None = None
    position_stats: dict[str, Any] = field(default_factory=dict)
    position_in_degree: dict[str, int] = field(default_factory=dict)
    position_targets: dict[str, tuple[str, ...]] = field(default_factory=dict)
    unresolved_jumps: list[str] = field(default_factory=list)
    scene_total: int = 0
    time_by_script: dict[str, int] = field(default_factory=dict)
    facets: dict[str, WireFacets] = field(default_factory=dict)
    locale: dict[str, Any] = field(default_factory=dict)
    lore: LoreDocument | None = None
    stats: StatsDocument | None = None
    missions: MissionDocument | None = None
    battles: BattleDocument | None = None
    checkpoints: CheckpointDocument | None = None
    entries: Any = None
    registry: labels.NameRegistry = field(default_factory=labels.NameRegistry)
    battle_cards: BattleCards | None = None
    reads: VarReadsPayload | None = None
    flags: FlagFactsPayload | None = None
    render: LanguageRender | None = None
    shards: list[ShardInfo] = field(default_factory=list)
    shard_by_node: dict[str, str] = field(default_factory=dict)
    checkpoint_mapping: dict[str, int] = field(default_factory=dict)
    parts: list[tuple[str, int]] = field(default_factory=list)
    language_report: dict[str, Any] = field(default_factory=dict)
    reused: int = 0
    failed: int = 0


def _load_sources(reporter: Reporter) -> dict[str, str]:
    if not LUA_DIR.is_dir():
        reporter.error("data/lua not found, run scriptindexer-extract first")
        return {}
    sources = load_lua_sources()
    if not sources:
        reporter.error("data/lua is empty, run scriptindexer-extract first")
    return sources


def _load_locale(lang: str, reporter: Reporter) -> dict[str, Any] | None:
    payload = read_json(LOCALE_DIR / f"{lang}.json")
    if not isinstance(payload, dict):
        reporter.error(f"missing or invalid locale table for {lang}, run scriptindexer-extract")
        return None
    return payload


def _load_document(name: str, reporter: Reporter, missing: str) -> Any | None:
    document = load_source(name)
    if document is None:
        reporter.warn(missing)
    return document


def _stage_analysis(context: BuildContext) -> None:
    sources = _load_sources(context.reporter)
    if not sources:
        raise BuildAborted
    context.models, context.reused, context.failed = analyze_all(
        sources, context.use_cache, context.reporter, context.jobs
    )
    failed = [(sid, model.error) for sid, model in sorted(context.models.items()) if model.error]
    for sid, error in failed[:20]:
        context.reporter.warn(f"{sid} failed to parse: {error}")
    if len(failed) > 20:
        context.reporter.warn(f"{len(failed) - 20} more scripts failed to parse")
    context.node_ids = sorted(context.models)


def _stage_graph(context: BuildContext) -> None:
    reporter = context.reporter
    reporter.stage(STAGE_GRAPH)
    context.entries = load_source("entries")
    if context.entries is None:
        reporter.warn("data/entries.json missing or outdated; position entries are unavailable")
    entry_targets = context.entries.position_targets if context.entries is not None else {}
    models = context.models
    collected = collect_edges(models)
    system = build_system_entries(context.node_ids)
    position_edges, position_stats = expand_positions(
        {sid: list(model.positions) for sid, model in models.items() if model.positions},
        context.node_ids,
        collected.adjacency,
        entry_targets,
    )
    edges = list(collected.edges)
    edges.extend(position_edges)
    position_in_degree = {sid: 0 for sid in context.node_ids}
    for edge in position_edges:
        position_in_degree[edge.target] += 1
    context.collected = collected
    context.edges = edges
    context.position_edges = position_edges
    context.system = system
    context.position_stats = position_stats
    context.position_in_degree = position_in_degree
    context.position_targets = position_target_map(position_edges)
    context.unresolved_jumps = collected.unresolved_jumps
    context.scene_total = sum(model.scene_count for model in models.values())
    context.chapters, chapter_index_by_id = build_chapters(context.node_ids)
    context.chapter_id_by_script = {sid: chapter_id(*classify(sid)) for sid in context.node_ids}
    context.chapter_index_by_script = {
        sid: chapter_index_by_id[context.chapter_id_by_script[sid]] for sid in context.node_ids
    }
    context.time_by_script = {
        sid: model.time for sid, model in models.items() if model.time is not None
    }
    reporter.info(
        f"{len(edges)} edges ({len(position_edges)} position),"
        f" {len(collected.unresolved_jumps)} dynamic jumps"
    )
    reporter.info(f"{context.scene_total} scene switches")
    reporter.info(
        f"{len(context.chapters)} chapters; {len(context.time_by_script)} scripts with a fixed date"
    )
    if context.time_by_script:
        reporter.info(
            f"time range: {_time_label(min(context.time_by_script.values()))}"
            f" -> {_time_label(max(context.time_by_script.values()))}"
        )
    reporter.info(
        f"system entries: {len(system.hardcoded)} hardcoded,"
        f" positions exact {position_stats['exact_names']}"
        f" + prefix {position_stats['prefix_names']}"
        f"/{position_stats['names']}"
    )
    probe = summarize_probe(context.entries)
    if not probe["ok"]:
        reporter.info(f"system position probe: {probe['reason']}")


def _stage_inputs(context: BuildContext) -> None:
    reporter = context.reporter
    locale = _load_locale(TEXT_SOURCE_LANG, reporter)
    if locale is None:
        raise BuildAborted
    context.locale = locale
    context.lore = _load_document(
        "lore", reporter, "data/lore.json missing; lore entries fall back to LegendInfo only"
    )
    context.stats = _load_document(
        "stats", reporter, "data/stats.json missing; stat names fall back to the locale table"
    )
    context.missions = _load_document(
        "missions",
        reporter,
        "data/missions.json missing; mission notes and start scripts are unavailable",
    )
    context.battles = _load_document(
        "battles", reporter, "data/battles.json missing; battle switches fall back to scene lines"
    )
    if context.missions is not None:
        labels.register_mission_names(context.missions, locale, context.registry)
        labels.canonicalize_missions(
            context.missions, locale, context.registry, _stat_notes(context.stats)
        )
    if context.battles is not None and context.battles.items:
        context.battle_cards = BattleCards(
            context.battles.items, locale, context.registry, _stat_notes(context.stats)
        )
        reporter.info(f"battle levels: {len(context.battles.items)} levels loaded")
    if context.stats is not None:
        reporter.info(f"stat names: {len(_stat_notes(context.stats))} notes loaded")
    if context.missions is not None:
        reporter.info(f"mission definitions: {len(context.missions.items)} missions loaded")


def _stat_notes(stats: StatsDocument | None) -> dict[str, str]:
    if stats is None:
        return {}
    return {key: record.note.strip() for key, record in stats.items.items() if record.note.strip()}


def _stage_render(context: BuildContext) -> None:
    reporter = context.reporter
    reporter.stage(STAGE_RENDER)
    checkpoints = load_source("checkpoints")
    if checkpoints is None:
        reporter.warn("data/checkpoints.json missing or outdated; checkpoint conditions are empty")
        checkpoints = CheckpointDocument()
    labels.canonicalize_checkpoints(
        checkpoints.items, context.locale, context.registry, _stat_notes(context.stats)
    )
    variants = sum(len(condition.variants) for condition in checkpoints.items.values())
    reporter.info(
        f"checkpoint conditions: {len(checkpoints.items)} conditions, {variants} variants"
        if checkpoints.items
        else "checkpoint conditions: none"
    )
    context.checkpoints = checkpoints
    context.reads = var_reads.collect_reads(checkpoints.items)
    context.flags = flag_facts.collect(checkpoints, context.missions, context.models)
    battle_facets = collect_battle_facets(context.models, context.battle_cards)
    context.facets = {
        sid: merge(
            collect_facets(context.models[sid].beats, context.models[sid].checks),
            battle_facets.get(sid),
        )
        for sid in context.node_ids
    }
    stat_notes = _stat_notes(context.stats)
    lore_items = context.lore.items if context.lore is not None else None
    renderer = Renderer(
        context.locale,
        lore_fallback=lore_items,
        registry=context.registry,
        stat_notes=stat_notes,
        battles=context.battle_cards,
        position_targets=context.position_targets,
    )
    started = time.time()
    script_rows: dict[str, list[Any]] = {}
    word_counts: dict[str, list[list[int]]] = {}
    for sid in context.node_ids:
        counter = TextCounter()
        renderer.counter = counter
        rows = renderer.render_rows(context.models[sid].beats)
        if rows:
            script_rows[sid] = rows
        word_counts[sid] = counter.counts_vector()
    chapters = {chapter.id: empty_counts() for chapter in context.chapters}
    for sid in context.node_ids:
        key = context.chapter_id_by_script[sid]
        if key in chapters:
            add_counts(chapters[key], word_counts[sid])
    edge_labels: dict[str, str] = {}
    for index, edge in enumerate(context.edges):
        if not edge.label:
            continue
        label = renderer.edge_label(edge.label)
        if label:
            edge_labels[str(index)] = label
    metrics = renderer.metrics()
    context.render = LanguageRender(
        lang=TEXT_SOURCE_LANG,
        script_rows=script_rows,
        word_counts=word_counts,
        chapter_counts=chapters,
        characters=renderer.character_table(),
        titles=renderer.title_table(),
        edge_labels=edge_labels,
        metrics=metrics,
        missing=renderer.missing,
        seconds=round(time.time() - started, 1),
    )
    reporter.info(
        f"battle cards: {metrics.battles} rendered, {metrics.battle_missing} missing levels"
    )
    reporter.info(
        f"rendered {TEXT_SOURCE_LANG}: {len(script_rows)} scripts, {metrics.options} options"
        f" ({metrics.locked} locked), {metrics.rich} rich text, {metrics.missing} missing keys"
    )
    reporter.info(
        f"inner monologue {metrics.think} ({metrics.think_named} with a speaker),"
        f" lore {metrics.lore} (fallback {metrics.lore_fallback},"
        f" unresolved {metrics.lore_missing})"
    )


def _stage_output(context: BuildContext) -> None:
    reporter = context.reporter
    reporter.stage(STAGE_OUTPUT)
    render = context.render
    assert render is not None
    sizes = {
        sid: len(msgspec.json.encode(render.script_rows.get(sid, []))) for sid in context.node_ids
    }
    context.shard_by_node, context.shards = pack_scripts(
        context.node_ids,
        sizes,
        context.chapter_index_by_script,
        [chapter.id for chapter in context.chapters],
    )
    largest = max((shard.bytes for shard in context.shards), default=0)
    reporter.info(
        f"script shards: {len(context.shards)} (largest {format_bytes(largest)},"
        f" budget {format_bytes(sum(shard.bytes for shard in context.shards))})"
    )
    shard_keys = [shard.key for shard in context.shards]
    head = TextHeadPayload(
        schema=version_of("textHead"),
        lang=TEXT_SOURCE_LANG,
        characters=render.characters,
        titles=render.titles,
        names=labels.finalize_registry(context.registry),
        edge_labels=render.edge_labels,
        missing_key_count=render.metrics.missing,
        missing_keys=render.missing[:200],
        shard_keys=shard_keys,
    )
    name, head_size = write("textHead", head, lang=TEXT_SOURCE_LANG)
    context.parts.append((name, head_size))
    buckets: dict[str, dict[str, Any]] = {key: {} for key in shard_keys}
    for sid, rows in render.script_rows.items():
        key = context.shard_by_node.get(sid)
        if key in buckets:
            buckets[key][sid] = rows
    shard_bytes = 0
    for shard in context.shards:
        payload = TextShardPayload(
            schema=version_of("textShard"),
            lang=TEXT_SOURCE_LANG,
            key=shard.key,
            scripts=buckets[shard.key],
        )
        name, size = write("textShard", payload, lang=TEXT_SOURCE_LANG, key=shard.key)
        context.parts.append((name, size))
        shard_bytes += size
    context.language_report = {
        "scripts": len(render.script_rows),
        "characters": len(render.characters),
        "titles": len(render.titles),
        "options": render.metrics.options,
        "locked_options": render.metrics.locked,
        "rich_text": render.metrics.rich,
        "think": render.metrics.think,
        "think_named": render.metrics.think_named,
        "lore": render.metrics.lore,
        "lore_fallback": render.metrics.lore_fallback,
        "lore_missing": render.metrics.lore_missing,
        "lore_missing_samples": list(render.metrics.lore_missing_samples),
        "edge_labels": len(render.edge_labels),
        "missing_keys": render.metrics.missing,
        "missing_samples": render.missing[:40],
        "head_bytes": head_size,
        "shard_count": len(context.shards),
        "shard_bytes": shard_bytes,
        "seconds": render.seconds,
    }
    reporter.info(
        f"wrote {TEXT_SOURCE_LANG}: head {format_bytes(head_size)}"
        f", {len(context.shards)} shards {format_bytes(shard_bytes)}"
    )
    wordcount = WordCountPayload(
        schema=version_of("wordcount"),
        kinds=list(TEXT_KINDS),
        langs={
            TEXT_SOURCE_LANG: WordCountLang(
                chapters=render.chapter_counts, scripts=render.word_counts
            )
        },
    )
    name, size = write("wordcount", wordcount)
    context.parts.append((name, size))
    checkpoints = context.checkpoints
    assert checkpoints is not None
    keys = sorted(checkpoints.items)
    context.checkpoint_mapping = shard_index_by_key(keys, CHECKPOINT_SHARDS)
    checkpoint_bytes = 0
    for index in range(CHECKPOINT_SHARDS):
        bucket = {
            key: checkpoints.items[key]
            for key in keys
            if context.checkpoint_mapping.get(key, 0) == index
        }
        payload = CheckpointDocument(
            schema=version_of("checkpoints"), items=bucket, gaps=checkpoints.gaps
        )
        name, size = write("checkpoints", payload, index=str(index))
        context.parts.append((name, size))
        checkpoint_bytes += size
    reporter.info(
        f"checkpoint conditions: {len(keys)} in {CHECKPOINT_SHARDS} shards,"
        f" {format_bytes(checkpoint_bytes)} total"
    )
    if context.missions is not None:
        name, size = write(
            "missions", MissionDocument(schema=version_of("missions"), items=context.missions.items)
        )
        context.parts.append((name, size))
        reporter.info(f"mission definitions: {len(context.missions.items)} missions published")
    reads = context.reads if context.reads is not None else VarReadsPayload()
    name, size = write(
        "varReads",
        VarReadsPayload(
            schema=version_of("varReads"), flag=reads.flag, stat=reads.stat, rel=reads.rel
        ),
    )
    context.parts.append((name, size))
    reporter.info(
        "checkpoint reads: "
        + ", ".join(
            f"{kind} {len(bucket)}"
            for kind, bucket in (("flag", reads.flag), ("stat", reads.stat), ("rel", reads.rel))
        )
        + f", {format_bytes(size)}"
    )
    flags = context.flags if context.flags is not None else FlagFactsPayload()
    name, size = write(
        "flagFacts", FlagFactsPayload(schema=version_of("flagFacts"), flags=flags.flags)
    )
    context.parts.append((name, size))
    reporter.info(f"flag facts: {len(flags.flags)} flags, {format_bytes(size)}")
    game_info = _game_info(context.manifest)
    if game_info.version or game_info.build:
        reporter.info(
            "game version: "
            + ", ".join(
                piece
                for piece in (
                    f"v{game_info.version}" if game_info.version else "",
                    f"build {game_info.build}" if game_info.build else "",
                    f"updated {game_info.updated}" if game_info.updated else "",
                )
                if piece
            )
        )
    else:
        reporter.info("game version: unavailable (normal when the game is not installed)")
    graph = GraphPayload(
        schema=version_of("graph"),
        meta=GraphMeta(
            generated=time.strftime("%Y-%m-%d %H:%M:%S"),
            game=game_info,
            langs=[TEXT_SOURCE_LANG, *DERIVED_LANGS],
            default_lang=context.default_lang,
            source_lang=TEXT_SOURCE_LANG,
            vocab=vocab.payload(),
            calendar=CalendarInfo(),
            counts=CountsInfo(
                scripts=len(context.node_ids),
                edges=len(context.edges),
                chapters=len(context.chapters),
                unresolved_jumps=len(context.unresolved_jumps),
            ),
            shards=context.shards,
            shard_by_node=context.shard_by_node,
            checkpoint_shard_by_key=context.checkpoint_mapping,
            system_entries=context.system.hardcoded if context.system is not None else [],
        ),
        chapters=context.chapters,
        nodes=assemble_nodes(
            context.node_ids,
            context.models,
            context.chapter_index_by_script,
            context.collected.out_degree if context.collected is not None else {},
            context.collected.in_degree if context.collected is not None else {},
            context.facets,
            set(context.manifest.get("anomalies", {}).get("empty_scripts") or []),
            set(context.manifest.get("anomalies", {}).get("simplified_only_scripts") or []),
            context.time_by_script,
        ),
        edges=edge_rows(context.edges),
    )
    name, size = write("graph", graph)
    context.parts.append((name, size))
    index = DataIndex(
        schema=contract_version(),
        generated=graph.meta.generated,
        langs=graph.meta.langs,
        default_lang=graph.meta.default_lang,
        source_lang=graph.meta.source_lang,
        artifacts={
            "graph": ArtifactEntry(url="data/graph.json", schema=version_of("graph")),
            "textHead": ArtifactEntry(
                url="data/text-{lang}-head.json",
                schema=version_of("textHead"),
                count=1,
                shards=shard_keys,
            ),
            "textShard": ArtifactEntry(
                url="data/text-{lang}-{key}.json",
                schema=version_of("textShard"),
                count=len(shard_keys),
                shards=shard_keys,
            ),
            "wordcount": ArtifactEntry(url="data/wordcount.json", schema=version_of("wordcount")),
            "missions": ArtifactEntry(
                url="data/missions.json",
                schema=version_of("missions"),
                count=len(context.missions.items) if context.missions is not None else 0,
            ),
            "checkpoints": ArtifactEntry(
                url="data/checkpoints-{index}.json",
                schema=version_of("checkpoints"),
                count=len(keys),
                shards=[str(index) for index in range(CHECKPOINT_SHARDS)],
            ),
            "varReads": ArtifactEntry(url="data/var-reads.json", schema=version_of("varReads")),
            "flagFacts": ArtifactEntry(
                url="data/flag-facts.json", schema=version_of("flagFacts"), count=len(flags.flags)
            ),
            "portraitManifest": ArtifactEntry(url="data/portraits/manifest.json", schema=""),
            "portrait": ArtifactEntry(url="data/portraits/{file}", schema=""),
        },
    )
    name, size = write("index", index)
    context.parts.append((name, size))
    kept = artifact_paths([TEXT_SOURCE_LANG], shard_keys, CHECKPOINT_SHARDS)
    kept.update(name for name, _size in context.parts)
    removed = prune(kept)
    if removed:
        reporter.info(f"removed {removed} stale artifacts")
    _write_report(context, graph, wordcount)


def _write_report(context: BuildContext, graph: GraphPayload, wordcount: WordCountPayload) -> None:
    reporter = context.reporter
    render = context.render
    assert render is not None
    metrics = render.metrics
    collected = context.collected
    checkpoints = context.checkpoints
    assert checkpoints is not None
    script_count = len(context.node_ids)
    edge_counts = {
        kind: sum(1 for edge in context.edges if edge.kind == kind) for kind in vocab.EDGE_KINDS
    }
    node_counts = {
        "empty": sum(1 for node in graph.nodes if node.flags is not None and node.flags.is_empty),
        "simplified_only": sum(
            1 for node in graph.nodes if node.flags is not None and node.flags.is_simplified_only
        ),
        "no_incoming": sum(1 for node in graph.nodes if node.in_degree == 0),
        "no_incoming_after_system": sum(
            1
            for node in graph.nodes
            if node.in_degree == 0 and context.position_in_degree.get(node.id, 0) == 0
        ),
        "position_in": sum(
            1 for node in graph.nodes if context.position_in_degree.get(node.id, 0) > 0
        ),
        "no_outgoing": sum(1 for node in graph.nodes if node.out_degree == 0),
    }
    facet_report = {
        "fields": list(vocab.FACET_KINDS),
        "speakers": len({key for row in context.facets.values() for key in row.speakers}),
        "flags": len({key for row in context.facets.values() for key in row.flags}),
        "checks": len({key for row in context.facets.values() for key in row.checks}),
        "stats": len({key for row in context.facets.values() for key in row.stats}),
        "relations": len({key for row in context.facets.values() for key in row.relations}),
        "endings": len({key for row in context.facets.values() for key in row.endings}),
        "scripts_with_ending": sum(1 for row in context.facets.values() if row.endings),
        "scripts_with_flag": sum(1 for row in context.facets.values() if row.flags),
        "scripts_with_check": sum(1 for row in context.facets.values() if row.checks),
        "scripts_with_lock": sum(1 for row in context.facets.values() if row.lock_count),
        "scripts_with_dice": sum(1 for row in context.facets.values() if row.dice_check_count),
        "scripts_with_options": sum(1 for row in context.facets.values() if row.option_count),
    }
    checkpoint_report = {
        "resolved": len(checkpoints.items),
        "variants": sum(len(item.variants) for item in checkpoints.items.values()),
        "bytes": sum(size for name, size in context.parts if name.startswith("checkpoints-")),
        "mode": "shards",
        "shards": CHECKPOINT_SHARDS,
        "by_kind": checkpoint_conditions.count_by_kind(checkpoints.items),
        "gaps": {
            "total": len(checkpoints.gaps),
            "by_reason": count_by_reason(checkpoints.gaps),
        },
    }
    wordcount_report = _wordcount_report(TEXT_SOURCE_LANG, wordcount, reporter)
    manifest = context.manifest
    battle_manifest = manifest.get("battle_stats") or {}
    battle_report = {
        "levels": len(context.battles.items) if context.battles is not None else 0,
        "used": metrics.battles,
        "missing": metrics.battle_missing,
        "extracted": battle_manifest.get("levels", 0),
        "by_kind": battle_manifest.get("by_kind") or {},
        "events": battle_manifest.get("events", 0),
        "actions": battle_manifest.get("actions", 0),
        "elapsed": battle_manifest.get("elapsed", 0),
    }
    lore_manifest = manifest.get("lore_stats") or {}
    lore_report = {
        "items": len(context.lore.items) if context.lore is not None else 0,
        "wanted": lore_manifest.get("wanted", 0),
        "resolved": lore_manifest.get("resolved", 0),
        "unresolved": lore_manifest.get("unresolved", 0),
        "fallback": metrics.lore_fallback,
        "missing": metrics.lore_missing,
        "samples": list(metrics.lore_missing_samples),
    }
    mission_manifest = manifest.get("mission_stats") or {}
    missions = context.missions
    mission_report = {
        "missions": len(missions.items) if missions is not None else 0,
        "states": sum(len(record.states) for record in missions.items.values())
        if missions is not None
        else 0,
        "conditions": sum(
            len(state.conditions)
            for record in missions.items.values()
            for state in record.states.values()
        )
        if missions is not None
        else 0,
        "dialogs": sum(
            len(state.start_dialogs) + len(state.alert_dialogs)
            for record in missions.items.values()
            for state in record.states.values()
        )
        if missions is not None
        else 0,
        "flags": sum(
            len(state.modify_flags_true) + len(state.modify_flags_false)
            for record in missions.items.values()
            for state in record.states.values()
        )
        if missions is not None
        else 0,
        "extracted": mission_manifest.get("missions", 0),
        "with_start": mission_manifest.get("with_start", 0),
        "with_mission_note": mission_manifest.get("with_mission_note", 0),
        "with_state_note": mission_manifest.get("with_state_note", 0),
        "with_conditions": mission_manifest.get("with_conditions", 0),
        "condition_gaps": mission_manifest.get("condition_gaps", 0),
        "with_dialogs": mission_manifest.get("with_dialogs", 0),
        "with_flags": mission_manifest.get("with_flags", 0),
        "inactive": mission_manifest.get("inactive", 0),
        "next_states": mission_manifest.get("next_states", 0),
        "before_main": mission_manifest.get("before_main", 0),
        "with_position": mission_manifest.get("with_position", 0),
        "unresolved": mission_manifest.get("unresolved", 0),
    }
    report_payload = build_report_payload(
        generated=time.strftime("%Y-%m-%d %H:%M:%S"),
        script_count=script_count,
        edge_counts=edge_counts,
        node_counts=node_counts,
        system_entries={
            "hardcoded": msgspec.to_builtins(context.system.hardcoded) if context.system else [],
            "hardcoded_missing": context.system.absent_hardcoded_ids if context.system else [],
            "position": context.position_stats,
            "asset_probe": summarize_probe(context.entries),
        },
        facets=facet_report,
        checkpoints=checkpoint_report,
        battles=battle_report,
        lore=lore_report,
        missions=mission_report,
        wordcount={
            "bytes": sum(size for name, size in context.parts if name == "wordcount.json"),
            "langs": wordcount_report,
        },
        time_stats={
            "explicit": len(context.time_by_script),
            "range": [
                list(date_parts_of(min(context.time_by_script.values()))),
                list(date_parts_of(max(context.time_by_script.values()))),
            ]
            if context.time_by_script
            else None,
            "scripts": sorted(context.time_by_script),
        },
        chapters=msgspec.to_builtins(context.chapters),
        text_artifact={
            "shard_count": len(context.shards),
            "largest_shard_kb": max(
                (round(shard.bytes / 1024) for shard in context.shards), default=0
            ),
            "shards": msgspec.to_builtins(context.shards),
        },
        languages={TEXT_SOURCE_LANG: context.language_report},
        unresolved_jumps=collected.unresolved_jumps if collected is not None else [],
        analysis={
            "failed": context.failed,
            "cache_reused": context.reused,
            "scene_switches": context.scene_total,
        },
        artifacts=[{"name": name, "size": size} for name, size in context.parts],
    )
    write_report(REPORT_PATH, report_payload)
    reporter.info(
        "graph.json "
        + format_bytes(sum(size for name, size in context.parts if name == "graph.json"))
        + ", "
        + ", ".join(
            f"{name} {format_bytes(size)}"
            for name, size in context.parts
            if name != "graph.json" and not name.startswith("checkpoints-")
        )
    )
    reporter.info(f"report -> {REPORT_PATH}")


class BuildAborted(Exception):
    pass


def _wordcount_report(lang: str, wordcount: WordCountPayload, reporter: Reporter) -> dict[str, Any]:
    rows = wordcount.langs[lang] if lang in wordcount.langs else WordCountLang()
    sums = sum_counts(rows.chapters)
    report = {
        "chapters": len(rows.chapters),
        "scripts": len(rows.scripts),
        "by_kind": {
            kind: {"zh": pair[0], "en": pair[1], "sum": pair[0] + pair[1]}
            for kind, pair in zip(TEXT_KINDS, sums, strict=True)
        },
        "total": {
            "zh": sum(pair[0] for pair in sums),
            "en": sum(pair[1] for pair in sums),
            "sum": sum(pair[0] + pair[1] for pair in sums),
        },
    }
    reporter.info(
        f"word count {lang}: {report['total']['sum']} chars ({report['scripts']} scripts)"
    )
    return report


def _game_info(manifest: dict[str, Any]) -> GameInfo:
    root = game_root()
    if root is None:
        raw = manifest.get("game")
        if isinstance(raw, str) and raw.strip():
            root = Path(raw)
    layout = discover(root)
    if layout is None:
        return GameInfo()
    session = AssetSession(layout, None)
    try:
        info = read_build_info(
            session, steamapps_dir(layout.install_dir), install_folder_name(layout.install_dir)
        )
        return GameInfo(
            version=info.version or "", build=info.build or "", updated=info.updated or ""
        )
    finally:
        session.close()


def _time_label(rounds: float) -> str:
    year, month, period = date_parts_of(rounds)
    return f"Y{year}-M{month}-P{period}"


BUILD_STEPS: tuple[tuple[str, Callable[[BuildContext], None]], ...] = (
    (STAGE_ANALYSIS, _stage_analysis),
    (STAGE_GRAPH, _stage_graph),
    ("inputs", _stage_inputs),
    (STAGE_RENDER, _stage_render),
    (STAGE_OUTPUT, _stage_output),
)


def run_build(
    *,
    langs: tuple[str, ...],
    default_lang: str,
    use_cache: bool = True,
    jobs: int | None = None,
    reporter: Reporter | None = None,
) -> BuildResult:
    reporter = reporter or Reporter()
    reporter.configure(BUILD_STAGES)
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if TEXT_SOURCE_LANG not in langs:
        reporter.error(f"{TEXT_SOURCE_LANG} is required; the reader ships the source text only")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if len(langs) > 1:
        reporter.warn(
            f"only {TEXT_SOURCE_LANG} is rendered; the other languages are derived at runtime"
        )
    manifest = read_json(MANIFEST_PATH)
    context = BuildContext(
        reporter=reporter,
        langs=langs,
        default_lang=default_lang,
        use_cache=use_cache,
        jobs=jobs,
        manifest=manifest if isinstance(manifest, dict) else {},
    )
    try:
        for _title, step in BUILD_STEPS:
            step(context)
    except BuildAborted:
        return BuildResult(
            False, len(context.node_ids), len(context.edges), len(context.chapters), {}, REPORT_PATH
        )
    if context.render is None or not context.render.script_rows:
        reporter.error("all scripts rendered empty, check the extraction output")
        return BuildResult(
            False, len(context.node_ids), len(context.edges), len(context.chapters), {}, REPORT_PATH
        )
    reporter.info(
        f"{len(context.node_ids)} nodes / {len(context.edges)} edges /"
        f" {len(context.chapters)} chapters"
    )
    if context.failed:
        reporter.warn(
            f"{context.failed} scripts failed to parse and were degraded to empty text"
            " (see report.json)"
        )
    return BuildResult(
        True,
        len(context.node_ids),
        len(context.edges),
        len(context.chapters),
        {TEXT_SOURCE_LANG: context.language_report},
        REPORT_PATH,
    )
