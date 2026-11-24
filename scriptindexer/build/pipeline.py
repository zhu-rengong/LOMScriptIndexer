import time
from dataclasses import dataclass
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
from ..jsonio import read_payload
from ..languages import DERIVED_LANGS, TEXT_SOURCE_LANG
from ..manifest import load_manifest
from ..output import format_bytes, prune, stale, write
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
    Manifest,
    MissionDocument,
    ReportPayload,
    ShardInfo,
    StatsDocument,
    TextHeadPayload,
    TextShardPayload,
    VarReadsPayload,
    WordCountLang,
    WordCountPayload,
    artifact_paths,
    artifact_version,
    entry,
    load_source,
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
    build_mission_edges,
    build_system_entries,
    collect_edges,
    edge_rows,
    expand_positions,
    mission_start_map,
    position_target_map,
    temp_target_map,
    travel_target_map,
)
from .report import write_report
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


@dataclass(frozen=True)
class BuildConfig:
    reporter: Reporter
    langs: tuple[str, ...]
    default_lang: str
    use_cache: bool
    jobs: int | None
    manifest: Manifest


@dataclass(frozen=True)
class AnalysisResult:
    models: dict[str, ScriptAnalysis]
    node_ids: list[str]
    reused: int
    failed: int


@dataclass(frozen=True)
class GraphResult:
    analysis: AnalysisResult
    entries: Any
    missions: MissionDocument | None
    collected: CollectedEdges
    system: SystemEntries
    position_edges: list[Edge]
    position_stats: dict[str, Any]
    position_in_degree: dict[str, int]
    position_targets: dict[str, tuple[str, ...]]
    temp_targets: dict[str, tuple[str, ...]]
    travel_targets: dict[str, tuple[str, ...]]
    edges: list[Edge]
    unresolved_jumps: list[str]
    scene_total: int
    chapters: list[ChapterRow]
    chapter_id_by_script: dict[str, str]
    chapter_index_by_script: dict[str, int]
    time_by_script: dict[str, int]

    @property
    def models(self) -> dict[str, ScriptAnalysis]:
        return self.analysis.models

    @property
    def node_ids(self) -> list[str]:
        return self.analysis.node_ids


@dataclass(frozen=True)
class RenderResult:
    graph: GraphResult
    missions: MissionDocument | None
    locale: dict[str, Any]
    lore: LoreDocument | None
    stats: StatsDocument | None
    battles: BattleDocument | None
    battle_cards: BattleCards | None
    registry: labels.NameRegistry
    checkpoints: CheckpointDocument
    reads: VarReadsPayload
    flags: FlagFactsPayload
    facets: dict[str, WireFacets]
    rendered: LanguageRender


@dataclass(frozen=True)
class OutputResult:
    parts: list[tuple[str, int]]
    shards: list[ShardInfo]
    shard_by_node: dict[str, str]
    checkpoint_mapping: dict[str, int]
    language_report: dict[str, Any]


def _load_sources(reporter: Reporter) -> dict[str, str]:
    if not LUA_DIR.is_dir():
        reporter.error("data/lua not found, run scriptindexer-extract first")
        return {}
    sources = load_lua_sources()
    if not sources:
        reporter.error("data/lua is empty, run scriptindexer-extract first")
    return sources


def _load_locale(lang: str, reporter: Reporter) -> dict[str, Any] | None:
    payload = read_payload(LOCALE_DIR / f"{lang}.json")
    if not isinstance(payload, dict):
        reporter.error(f"missing or invalid locale table for {lang}, run scriptindexer-extract")
        return None
    return payload


def _load_document(name: str, reporter: Reporter, missing: str) -> Any | None:
    document = load_source(name)
    if document is None:
        reporter.warn(missing)
    return document


def _analyze(config: BuildConfig) -> AnalysisResult:
    reporter = config.reporter
    sources = _load_sources(reporter)
    if not sources:
        raise BuildAborted
    models, reused, failed = analyze_all(sources, config.use_cache, reporter, config.jobs)
    reporter.warn_failures(
        [(sid, model.error) for sid, model in sorted(models.items()) if model.error]
    )
    return AnalysisResult(models, sorted(models), reused, failed)


def _build_graph(config: BuildConfig, analysis: AnalysisResult) -> GraphResult:
    reporter = config.reporter
    reporter.stage(STAGE_GRAPH)
    models = analysis.models
    node_ids = analysis.node_ids
    entries = load_source("entries")
    if entries is None:
        reporter.warn("data/entries.json missing or outdated; position entries are unavailable")
    missions = load_source("missions")
    entry_targets = entries.position_targets if entries is not None else {}
    collected = collect_edges(models)
    system = build_system_entries(node_ids)
    position_edges, position_stats = expand_positions(
        {sid: list(model.positions) for sid, model in models.items() if model.positions},
        node_ids,
        collected.adjacency,
        entry_targets,
    )
    edges = list(collected.edges)
    edges.extend(position_edges)
    position_in_degree = {sid: 0 for sid in node_ids}
    for edge in position_edges:
        position_in_degree[edge.target] += 1
    position_targets = position_target_map(position_edges)
    temp_targets = temp_target_map(models, node_ids)
    travel_targets = travel_target_map(models, edges, node_ids)
    mission_edges = build_mission_edges(models, mission_start_map(missions), node_ids)
    edges.extend(mission_edges)
    unresolved_jumps = collected.unresolved_jumps
    scene_total = sum(model.scene_count for model in models.values())
    chapters, chapter_index_by_id = build_chapters(node_ids)
    chapter_id_by_script = {sid: chapter_id(*classify(sid)) for sid in node_ids}
    chapter_index_by_script = {
        sid: chapter_index_by_id[chapter_id_by_script[sid]] for sid in node_ids
    }
    time_by_script = {sid: model.time for sid, model in models.items() if model.time is not None}
    reporter.info(
        f"{len(edges)} edges ({len(position_edges)} position,"
        f" {len(mission_edges)} mission),"
        f" {len(collected.unresolved_jumps)} dynamic jumps"
    )
    reporter.info(f"{scene_total} scene switches")
    reporter.info(
        f"{len(chapters)} chapters; {len(time_by_script)} scripts with a fixed date"
    )
    if time_by_script:
        reporter.info(
            f"time range: {_time_label(min(time_by_script.values()))}"
            f" -> {_time_label(max(time_by_script.values()))}"
        )
    reporter.info(
        f"system entries: {len(system.hardcoded)} hardcoded,"
        f" positions exact {position_stats['exact_names']}"
        f" + prefix {position_stats['prefix_names']}"
        f"/{position_stats['names']}"
    )
    reporter.info(
        f"dynamic slots: {len(temp_targets)} temp ("
        f"{sum(len(targets) for targets in temp_targets.values())} targets),"
        f" {len(travel_targets)} travel readers narrowed"
    )
    probe = summarize_probe(entries)
    if not probe["ok"]:
        reporter.info(f"system position probe: {probe['reason']}")
    return GraphResult(
        analysis=analysis,
        entries=entries,
        missions=missions,
        collected=collected,
        system=system,
        position_edges=position_edges,
        position_stats=position_stats,
        position_in_degree=position_in_degree,
        position_targets=position_targets,
        temp_targets=temp_targets,
        travel_targets=travel_targets,
        edges=edges,
        unresolved_jumps=unresolved_jumps,
        scene_total=scene_total,
        chapters=chapters,
        chapter_id_by_script=chapter_id_by_script,
        chapter_index_by_script=chapter_index_by_script,
        time_by_script=time_by_script,
    )


def _render(config: BuildConfig, graph: GraphResult) -> RenderResult:
    reporter = config.reporter
    reporter.stage(STAGE_RENDER)
    locale = _load_locale(TEXT_SOURCE_LANG, reporter)
    if locale is None:
        raise BuildAborted
    lore = _load_document(
        "lore", reporter, "data/lore.json missing; lore entries fall back to LegendInfo only"
    )
    stats = _load_document(
        "stats", reporter, "data/stats.json missing; stat names fall back to the locale table"
    )
    missions = graph.missions
    if missions is None:
        missions = _load_document(
            "missions",
            reporter,
            "data/missions.json missing; mission notes and start scripts are unavailable",
        )
    battles = _load_document(
        "battles", reporter, "data/battles.json missing; battle switches fall back to scene lines"
    )
    registry = labels.NameRegistry()
    stat_notes = _stat_notes(stats)
    if missions is not None:
        labels.register_mission_names(missions, locale, registry)
        labels.canonicalize_missions(missions, locale, registry, stat_notes)
    battle_cards: BattleCards | None = None
    if battles is not None and battles.items:
        battle_cards = BattleCards(battles.items, locale, registry, stat_notes)
        reporter.info(f"battle levels: {len(battles.items)} levels loaded")
    if stats is not None:
        reporter.info(f"stat names: {len(stat_notes)} notes loaded")
    if missions is not None:
        reporter.info(f"mission definitions: {len(missions.items)} missions loaded")
    checkpoints = load_source("checkpoints")
    if checkpoints is None:
        reporter.warn("data/checkpoints.json missing or outdated; checkpoint conditions are empty")
        checkpoints = CheckpointDocument()
    labels.canonicalize_checkpoints(checkpoints.items, locale, registry, stat_notes)
    variants = sum(len(condition.variants) for condition in checkpoints.items.values())
    reporter.info(
        f"checkpoint conditions: {len(checkpoints.items)} conditions, {variants} variants"
        if checkpoints.items
        else "checkpoint conditions: none"
    )
    reads = var_reads.collect_reads(checkpoints.items)
    flags = flag_facts.collect(checkpoints, missions, graph.models)
    battle_facets = collect_battle_facets(graph.models, battle_cards)
    mission_owner: dict[str, str] = {}
    named_states: set[str] = set()
    if missions is not None:
        for mission_id, record in missions.items.items():
            for state_key, state in record.states.items():
                mission_owner[state_key] = mission_id
                if state.desc:
                    named_states.add(state_key)
    reporter.info(f"mission states: {len(mission_owner)} total, {len(named_states)} named")
    facets = {
        sid: merge(
            collect_facets(
                graph.models[sid].beats,
                graph.models[sid].checks,
                mission_owner,
                named_states,
            ),
            battle_facets.get(sid),
        )
        for sid in graph.node_ids
    }
    lore_items = lore.items if lore is not None else None
    renderer = Renderer(
        locale,
        lore_fallback=lore_items,
        registry=registry,
        stat_notes=stat_notes,
        battles=battle_cards,
        position_targets=graph.position_targets,
        temp_targets=graph.temp_targets,
        travel_targets=graph.travel_targets,
    )
    started = time.time()
    script_rows: dict[str, list[Any]] = {}
    word_counts: dict[str, list[list[int]]] = {}
    for sid in graph.node_ids:
        counter = TextCounter()
        renderer.counter = counter
        renderer.script_id = sid
        rows = renderer.render_rows(graph.models[sid].beats)
        if rows:
            script_rows[sid] = rows
        word_counts[sid] = counter.counts_vector()
    chapters = {chapter.id: empty_counts() for chapter in graph.chapters}
    for sid in graph.node_ids:
        key = graph.chapter_id_by_script[sid]
        if key in chapters:
            add_counts(chapters[key], word_counts[sid])
    edge_labels: dict[str, str] = {}
    for index, edge in enumerate(graph.edges):
        if not edge.label:
            continue
        label = renderer.edge_label(edge.label)
        if label:
            edge_labels[str(index)] = label
    metrics = renderer.metrics()
    rendered = LanguageRender(
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
    return RenderResult(
        graph=graph,
        missions=missions,
        locale=locale,
        lore=lore,
        stats=stats,
        battles=battles,
        battle_cards=battle_cards,
        registry=registry,
        checkpoints=checkpoints,
        reads=reads,
        flags=flags,
        facets=facets,
        rendered=rendered,
    )


def _output(config: BuildConfig, result: RenderResult) -> OutputResult:
    reporter = config.reporter
    reporter.stage(STAGE_OUTPUT)
    render = result.rendered
    graph = result.graph
    parts: list[tuple[str, int]] = []
    sizes = {
        sid: len(msgspec.json.encode(render.script_rows.get(sid, []))) for sid in graph.node_ids
    }
    shard_by_node, shards = pack_scripts(
        graph.node_ids,
        sizes,
        graph.chapter_index_by_script,
        [chapter.id for chapter in graph.chapters],
    )
    largest = max((shard.bytes for shard in shards), default=0)
    reporter.info(
        f"script shards: {len(shards)} (largest {format_bytes(largest)},"
        f" budget {format_bytes(sum(shard.bytes for shard in shards))})"
    )
    shard_keys = [shard.key for shard in shards]
    head = TextHeadPayload(
        schema=artifact_version("textHead"),
        lang=TEXT_SOURCE_LANG,
        characters=render.characters,
        titles=render.titles,
        names=labels.finalize_registry(result.registry),
        edge_labels=render.edge_labels,
        missing_key_count=render.metrics.missing,
        missing_keys=render.missing[:200],
        shard_keys=shard_keys,
    )
    name, head_size = write("textHead", head, lang=TEXT_SOURCE_LANG)
    parts.append((name, head_size))
    buckets: dict[str, dict[str, Any]] = {key: {} for key in shard_keys}
    for sid, rows in render.script_rows.items():
        key = shard_by_node.get(sid)
        if key in buckets:
            buckets[key][sid] = rows
    shard_bytes = 0
    for shard in shards:
        payload = TextShardPayload(
            schema=artifact_version("textShard"),
            lang=TEXT_SOURCE_LANG,
            key=shard.key,
            scripts=buckets[shard.key],
        )
        name, size = write("textShard", payload, lang=TEXT_SOURCE_LANG, key=shard.key)
        parts.append((name, size))
        shard_bytes += size
    language_report = {
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
        "shard_count": len(shards),
        "shard_bytes": shard_bytes,
        "seconds": render.seconds,
    }
    reporter.info(
        f"wrote {TEXT_SOURCE_LANG}: head {format_bytes(head_size)}"
        f", {len(shards)} shards {format_bytes(shard_bytes)}"
    )
    wordcount = WordCountPayload(
        schema=artifact_version("wordcount"),
        kinds=list(TEXT_KINDS),
        langs={
            TEXT_SOURCE_LANG: WordCountLang(
                chapters=render.chapter_counts, scripts=render.word_counts
            )
        },
    )
    name, size = write("wordcount", wordcount)
    parts.append((name, size))
    checkpoints = result.checkpoints
    keys = sorted(checkpoints.items)
    checkpoint_mapping = shard_index_by_key(keys, CHECKPOINT_SHARDS)
    checkpoint_bytes = 0
    for index in range(CHECKPOINT_SHARDS):
        bucket = {
            key: checkpoints.items[key]
            for key in keys
            if checkpoint_mapping.get(key, 0) == index
        }
        payload = CheckpointDocument(
            schema=artifact_version("checkpoints"), items=bucket, gaps=checkpoints.gaps
        )
        name, size = write("checkpoints", payload, index=str(index))
        parts.append((name, size))
        checkpoint_bytes += size
    reporter.info(
        f"checkpoint conditions: {len(keys)} in {CHECKPOINT_SHARDS} shards,"
        f" {format_bytes(checkpoint_bytes)} total"
    )
    if result.missions is not None:
        name, size = write(
            "missions",
            MissionDocument(schema=artifact_version("missions"), items=result.missions.items),
        )
        parts.append((name, size))
        reporter.info(
            f"mission definitions: {len(result.missions.items)} missions published"
        )
    reads = result.reads
    name, size = write(
        "varReads",
        VarReadsPayload(
            schema=artifact_version("varReads"), flag=reads.flag, stat=reads.stat, rel=reads.rel
        ),
    )
    parts.append((name, size))
    reporter.info(
        "checkpoint reads: "
        + ", ".join(
            f"{kind} {len(bucket)}"
            for kind, bucket in (("flag", reads.flag), ("stat", reads.stat), ("rel", reads.rel))
        )
        + f", {format_bytes(size)}"
    )
    flags = result.flags
    name, size = write(
        "flagFacts", FlagFactsPayload(schema=artifact_version("flagFacts"), flags=flags.flags)
    )
    parts.append((name, size))
    reporter.info(f"flag facts: {len(flags.flags)} flags, {format_bytes(size)}")
    game_info = _game_info(config.manifest)
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
    payload = GraphPayload(
        schema=artifact_version("graph"),
        meta=GraphMeta(
            generated=time.strftime("%Y-%m-%d %H:%M:%S"),
            game=game_info,
            langs=[TEXT_SOURCE_LANG, *DERIVED_LANGS],
            default_lang=config.default_lang,
            source_lang=TEXT_SOURCE_LANG,
            vocab=vocab.payload(),
            calendar=CalendarInfo(),
            counts=CountsInfo(
                scripts=len(graph.node_ids),
                edges=len(graph.edges),
                chapters=len(graph.chapters),
                unresolved_jumps=len(graph.unresolved_jumps),
            ),
            shards=shards,
            shard_by_node=shard_by_node,
            checkpoint_shard_by_key=checkpoint_mapping,
            system_entries=graph.system.hardcoded,
        ),
        chapters=graph.chapters,
        nodes=assemble_nodes(
            graph.node_ids,
            graph.models,
            graph.chapter_index_by_script,
            graph.collected.out_degree,
            graph.collected.in_degree,
            result.facets,
            set(config.manifest.anomaly("empty_scripts")),
            set(config.manifest.anomaly("simplified_only_scripts")),
            graph.time_by_script,
        ),
        edges=edge_rows(graph.edges),
    )
    name, size = write("graph", payload)
    parts.append((name, size))
    index = DataIndex(
        schema=contract_version(),
        generated=payload.meta.generated,
        langs=payload.meta.langs,
        default_lang=payload.meta.default_lang,
        source_lang=payload.meta.source_lang,
        artifacts={
            "graph": entry("graph"),
            "textHead": entry("textHead", count=1, shards=shard_keys),
            "textShard": entry("textShard", count=len(shard_keys), shards=shard_keys),
            "wordcount": entry("wordcount"),
            "missions": entry(
                "missions", count=len(result.missions.items) if result.missions else 0
            ),
            "checkpoints": entry(
                "checkpoints",
                count=len(keys),
                shards=[str(index) for index in range(CHECKPOINT_SHARDS)],
            ),
            "varReads": entry("varReads"),
            "flagFacts": entry("flagFacts", count=len(flags.flags)),
            "portraitManifest": ArtifactEntry(url="data/portraits/manifest.json"),
            "portrait": ArtifactEntry(url="data/portraits/{file}"),
        },
    )
    name, size = write("index", index)
    parts.append((name, size))
    kept = artifact_paths([TEXT_SOURCE_LANG], shard_keys, CHECKPOINT_SHARDS)
    kept.update(name for name, _size in parts)
    doomed = stale(kept)
    if doomed:
        reporter.info(f"stale artifacts: {', '.join(doomed)}")
    removed = prune(doomed)
    if removed:
        reporter.info(f"removed {removed} stale artifacts")
    _write_report(config, result, payload, wordcount, parts, language_report)
    return OutputResult(
        parts=parts,
        shards=shards,
        shard_by_node=shard_by_node,
        checkpoint_mapping=checkpoint_mapping,
        language_report=language_report,
    )


def _write_report(
    config: BuildConfig,
    result: RenderResult,
    payload: GraphPayload,
    wordcount: WordCountPayload,
    parts: list[tuple[str, int]],
    language_report: dict[str, Any],
) -> None:
    reporter = config.reporter
    graph = result.graph
    render = result.rendered
    metrics = render.metrics
    collected = graph.collected
    checkpoints = result.checkpoints
    script_count = len(graph.node_ids)
    edge_counts = {
        kind: sum(1 for edge in graph.edges if edge.kind == kind) for kind in vocab.EDGE_KINDS
    }
    node_counts = {
        "empty": sum(1 for node in payload.nodes if node.flags is not None and node.flags.is_empty),
        "simplified_only": sum(
            1 for node in payload.nodes if node.flags is not None and node.flags.is_simplified_only
        ),
        "no_incoming": sum(1 for node in payload.nodes if node.in_degree == 0),
        "no_incoming_after_system": sum(
            1
            for node in payload.nodes
            if node.in_degree == 0 and graph.position_in_degree.get(node.id, 0) == 0
        ),
        "position_in": sum(
            1 for node in payload.nodes if graph.position_in_degree.get(node.id, 0) > 0
        ),
        "no_outgoing": sum(1 for node in payload.nodes if node.out_degree == 0),
    }
    facet_report = {
        "fields": list(vocab.FACET_KINDS),
        "speakers": len({key for row in result.facets.values() for key in row.speakers}),
        "flags": len({key for row in result.facets.values() for key in row.flags}),
        "checks": len({key for row in result.facets.values() for key in row.checks}),
        "stats": len({key for row in result.facets.values() for key in row.stats}),
        "relations": len({key for row in result.facets.values() for key in row.relations}),
        "endings": len({key for row in result.facets.values() for key in row.endings}),
        "chronicles": len({key for row in result.facets.values() for key in row.chronicles}),
        "endgames": len({key for row in result.facets.values() for key in row.endgames}),
        "missions": len({key for row in result.facets.values() for key in row.missions}),
        "scripts_with_ending": sum(1 for row in result.facets.values() if row.endings),
        "scripts_with_mission": sum(1 for row in result.facets.values() if row.missions),
        "scripts_with_flag": sum(1 for row in result.facets.values() if row.flags),
        "scripts_with_check": sum(1 for row in result.facets.values() if row.checks),
        "scripts_with_lock": sum(1 for row in result.facets.values() if row.lock_count),
        "scripts_with_dice": sum(1 for row in result.facets.values() if row.dice_check_count),
        "scripts_with_options": sum(1 for row in result.facets.values() if row.option_count),
    }
    checkpoint_report = {
        "resolved": len(checkpoints.items),
        "variants": sum(len(item.variants) for item in checkpoints.items.values()),
        "bytes": sum(size for name, size in parts if name.startswith("checkpoints-")),
        "mode": "shards",
        "shards": CHECKPOINT_SHARDS,
        "by_kind": checkpoint_conditions.count_by_kind(checkpoints.items),
        "gaps": {
            "total": len(checkpoints.gaps),
            "by_reason": count_by_reason(checkpoints.gaps),
        },
    }
    wordcount_report = _wordcount_report(TEXT_SOURCE_LANG, wordcount, reporter)
    manifest = config.manifest
    battle_manifest = manifest.battle_stats
    battle_report = {
        "levels": len(result.battles.items) if result.battles is not None else 0,
        "used": metrics.battles,
        "missing": metrics.battle_missing,
        "extracted": battle_manifest.get("levels", 0),
        "by_kind": battle_manifest.get("by_kind") or {},
        "events": battle_manifest.get("events", 0),
        "actions": battle_manifest.get("actions", 0),
        "elapsed": battle_manifest.get("elapsed", 0),
    }
    lore_manifest = manifest.lore_stats
    lore_report = {
        "items": len(result.lore.items) if result.lore is not None else 0,
        "wanted": lore_manifest.get("wanted", 0),
        "resolved": lore_manifest.get("resolved", 0),
        "unresolved": lore_manifest.get("unresolved", 0),
        "fallback": metrics.lore_fallback,
        "missing": metrics.lore_missing,
        "samples": list(metrics.lore_missing_samples),
    }
    mission_manifest = manifest.mission_stats
    missions = result.missions
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
    report = ReportPayload(
        schema=contract_version(),
        generated=time.strftime("%Y-%m-%d %H:%M:%S"),
        scripts=script_count,
        edges=edge_counts,
        nodes=node_counts,
        entries={
            "hardcoded": msgspec.to_builtins(graph.system.hardcoded),
            "hardcoded_missing": graph.system.absent_hardcoded_ids,
            "position": graph.position_stats,
            "asset_probe": summarize_probe(graph.entries),
        },
        facets=facet_report,
        checkpoints=checkpoint_report,
        battles=battle_report,
        lore=lore_report,
        missions=mission_report,
        wordcount={
            "bytes": sum(size for name, size in parts if name == "wordcount.json"),
            "langs": wordcount_report,
        },
        time={
            "explicit": len(graph.time_by_script),
            "range": [
                list(date_parts_of(min(graph.time_by_script.values()))),
                list(date_parts_of(max(graph.time_by_script.values()))),
            ]
            if graph.time_by_script
            else None,
            "scripts": sorted(graph.time_by_script),
        },
        chapters=msgspec.to_builtins(graph.chapters),
        text={
            "shard_count": len(payload.meta.shards),
            "largest_shard_kb": max(
                (round(shard.bytes / 1024) for shard in payload.meta.shards), default=0
            ),
            "shards": msgspec.to_builtins(payload.meta.shards),
        },
        languages={TEXT_SOURCE_LANG: language_report},
        unresolved_jumps=list(collected.unresolved_jumps),
        analysis={
            "failed": graph.analysis.failed,
            "cache_reused": graph.analysis.reused,
            "scene_switches": graph.scene_total,
        },
        artifacts=[{"name": name, "size": size} for name, size in parts],
    )
    write_report(REPORT_PATH, report)
    reporter.info(
        "graph.json "
        + format_bytes(sum(size for name, size in parts if name == "graph.json"))
        + ", "
        + ", ".join(
            f"{name} {format_bytes(size)}"
            for name, size in parts
            if name != "graph.json" and not name.startswith("checkpoints-")
        )
    )
    reporter.info(f"report -> {REPORT_PATH}")


class BuildAborted(Exception):
    pass


def _stat_notes(stats: StatsDocument | None) -> dict[str, str]:
    if stats is None:
        return {}
    return {key: record.note.strip() for key, record in stats.items.items() if record.note.strip()}


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


def _game_info(manifest: Manifest) -> GameInfo:
    root = game_root()
    if root is None and manifest.game.strip():
        root = Path(manifest.game)
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


def run_build(
    *,
    langs: tuple[str, ...],
    default_lang: str,
    use_cache: bool = True,
    jobs: int | None = None,
    reporter: Reporter | None = None,
) -> BuildResult:
    active = reporter or Reporter()
    active.configure(BUILD_STAGES)
    if not langs:
        active.error("no language selected; pass --langs zh-tw")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if TEXT_SOURCE_LANG not in langs:
        active.error(f"{TEXT_SOURCE_LANG} is required; the reader ships the source text only")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if len(langs) > 1:
        active.warn(
            f"only {TEXT_SOURCE_LANG} is rendered; the other languages are derived at runtime"
        )
    config = BuildConfig(
        reporter=active,
        langs=langs,
        default_lang=default_lang,
        use_cache=use_cache,
        jobs=jobs,
        manifest=load_manifest(MANIFEST_PATH) or Manifest(),
    )
    analysis: AnalysisResult | None = None
    graph: GraphResult | None = None
    try:
        analysis = _analyze(config)
        graph = _build_graph(config, analysis)
        result = _render(config, graph)
        output = _output(config, result)
    except BuildAborted:
        return BuildResult(
            False,
            len(graph.node_ids) if graph is not None else len(analysis.node_ids) if analysis else 0,
            len(graph.edges) if graph is not None else 0,
            len(graph.chapters) if graph is not None else 0,
            {},
            REPORT_PATH,
        )
    if not result.rendered.script_rows:
        active.error("all scripts rendered empty, check the extraction output")
        return BuildResult(
            False, len(graph.node_ids), len(graph.edges), len(graph.chapters), {}, REPORT_PATH
        )
    active.info(
        f"{len(graph.node_ids)} nodes / {len(graph.edges)} edges /"
        f" {len(graph.chapters)} chapters"
    )
    if graph.analysis.failed:
        active.warn(
            f"{graph.analysis.failed} scripts failed to parse and were degraded to empty text"
            " (see report.json)"
        )
    return BuildResult(
        True,
        len(graph.node_ids),
        len(graph.edges),
        len(graph.chapters),
        {TEXT_SOURCE_LANG: output.language_report},
        REPORT_PATH,
    )
