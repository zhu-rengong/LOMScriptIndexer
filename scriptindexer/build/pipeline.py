import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import vocab
from ..analysis_cache import STAGE_ANALYSIS, analyze_all
from ..calendar import ROUNDS_PER_MONTH, ROUNDS_PER_YEAR, date_parts_of
from ..console import Reporter
from ..game.assets import AssetSession
from ..game.build_info import read_build_info
from ..game.entries import summarize as summarize_probe
from ..game.layout import discover, game_root, install_folder_name, steamapps_dir
from ..game.unity_objects import count_by_reason
from ..js_writer import (
    assets_payload,
    prune,
    text_payload,
    write_checkpoint_shards,
    write_graph,
    write_missions,
    write_text_head,
    write_text_shard,
    write_var_reads,
    write_wordcount,
)
from ..jsonio import dump_json, read_json
from ..languages import DERIVED_LANGS, TEXT_SOURCE_LANG
from ..paths import (
    CHECKPOINTS_PATH,
    ENTRIES_PATH,
    LOCALE_DIR,
    LORE_PATH,
    LUA_DIR,
    MANIFEST_PATH,
    MISSIONS_PATH,
    REPORT_PATH,
    SITE_DATA_DIR,
    STATS_PATH,
    BATTLES_PATH,
)
from ..script_model import Edge, Facets, GameInfo, ScriptAnalysis
from ..versions import (
    BATTLE_VERSION,
    CHECKPOINT_SHARDS,
    CHECKPOINT_VERSION,
    ENTRY_VERSION,
    LORE_VERSION,
    MISSION_VERSION,
    SCHEMA_VERSION,
    STAT_VERSION,
)
from . import checkpoint_conditions, labels, var_reads
from . import load_lua_sources
from .battle_cards import BattleCards, collect_battle_facets
from .chapters import build_chapters, chapter_id, classify
from .facets import collect_facets, merge
from .graph import (
    CollectedEdges,
    SystemEntries,
    assemble_nodes,
    build_system_entries,
    collect_edges,
    expand_positions,
    position_target_map,
)
from .report import build_report_payload, format_bytes, write_report
from .script_render import Renderer
from .sharding import pack_scripts, shard_index_by_key
from .text_metrics import TEXT_KINDS, TextCounter, add_counts, empty_counts, sum_counts


STAGE_GRAPH = "graph"
STAGE_RENDER = "render"
STAGE_OUTPUT = "output"

BUILD_STAGES = (STAGE_ANALYSIS, STAGE_GRAPH, STAGE_RENDER, STAGE_OUTPUT)


@dataclass
class BuildResult:
    ok: bool
    scripts: int
    edges: int
    chapters: int
    languages: dict[str, Any]
    report_path: Path


@dataclass
class LanguageRender:
    lang: str
    script_rows: dict[str, list]
    word_counts: dict[str, list[list[int]]]
    chapter_counts: dict[str, list[list[int]]]
    characters: dict[str, str]
    titles: dict[str, str]
    edge_labels: dict[str, str]
    metrics: dict[str, Any]
    missing: list[str]
    seconds: float


@dataclass
class BuildCounts:
    edge_counts: dict[str, Any]
    node_counts: dict[str, Any]
    facet_report: dict[str, Any]
    checkpoint_report: dict[str, Any]


@dataclass
class CollectedGraph:
    collected: CollectedEdges
    edges: list[Edge]
    position_edges: list[Edge]
    system: SystemEntries
    position_stats: dict[str, Any]
    position_in_degree: dict[str, int]
    position_targets: dict[str, tuple[str, ...]]


def _load_sources(reporter: Reporter) -> dict[str, str]:
    if not LUA_DIR.is_dir():
        reporter.error("data/lua not found, run extract.py first")
        return {}
    sources = load_lua_sources()
    if not sources:
        reporter.error("data/lua is empty, run extract.py first")
    return sources


def _load_locale(lang: str, reporter: Reporter) -> dict | None:
    payload = read_json(LOCALE_DIR / f"{lang}.json")
    if not isinstance(payload, dict):
        reporter.error(f"missing or invalid locale table for {lang}, run extract.py first")
        return None
    return payload


def _load_lore(reporter: Reporter) -> dict[str, str]:
    payload = read_json(LORE_PATH)
    if not isinstance(payload, dict):
        reporter.warn("data/lore.json missing; lore entries fall back to LegendInfo only")
        return {}
    if payload.get("version") != LORE_VERSION:
        reporter.warn(
            f"data/lore.json version {payload.get('version')} does not match {LORE_VERSION};"
            " rerun extract.py"
        )
        return {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {}
    return {
        key: value for key, value in items.items()
        if isinstance(key, str) and isinstance(value, str) and value
    }


def _load_battles(reporter: Reporter) -> dict[str, Any]:
    payload = read_json(BATTLES_PATH)
    if not isinstance(payload, dict):
        reporter.warn("data/battles.json missing; battle switches fall back to scene lines")
        return {}
    if payload.get("version") != BATTLE_VERSION:
        reporter.warn(
            f"data/battles.json version {payload.get('version')} does not match"
            f" {BATTLE_VERSION}; rerun extract.py"
        )
        return {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {}
    reporter.info(f"battle levels: {len(items)} levels loaded")
    return items


def _load_stat_notes(reporter: Reporter) -> dict[str, str]:
    payload = read_json(STATS_PATH)
    if not isinstance(payload, dict):
        reporter.warn("data/stats.json missing; stat names fall back to the locale table")
        return {}
    if payload.get("version") != STAT_VERSION:
        reporter.warn(
            f"data/stats.json version {payload.get('version')} does not match {STAT_VERSION};"
            " rerun extract.py"
        )
        return {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {}
    notes: dict[str, str] = {}
    for key, record in items.items():
        if not isinstance(key, str) or not isinstance(record, dict):
            continue
        note = record.get("note")
        if isinstance(note, str) and note.strip():
            notes[key] = note.strip()
    reporter.info(f"stat names: {len(notes)} notes from {len(items)} assets")
    return notes


def _load_missions(reporter: Reporter) -> dict[str, dict[str, Any]]:
    payload = read_json(MISSIONS_PATH)
    if not isinstance(payload, dict):
        reporter.warn("data/missions.json missing; mission notes and start scripts are unavailable")
        return {}
    if payload.get("version") != MISSION_VERSION:
        reporter.warn(
            f"data/missions.json version {payload.get('version')} does not match"
            f" {MISSION_VERSION}; rerun extract.py"
        )
        return {}
    items = payload.get("items")
    if not isinstance(items, dict):
        return {}
    missions = {
        key: record for key, record in items.items()
        if isinstance(key, str) and isinstance(record, dict)
    }
    reporter.info(f"mission definitions: {len(missions)} missions loaded")
    return missions


def _register_mission_names(missions: dict[str, dict[str, Any]], locale: dict[str, Any],
                            name_registry: labels.NameTables) -> None:
    mission_table = name_registry.setdefault("mission", {})
    state_table = name_registry.setdefault("missionState", {})
    dialog_table = name_registry.setdefault("missionDialog", {})
    position_table = name_registry.setdefault("missionPosition", {})
    raw_position = locale.get("Position") if isinstance(locale, dict) else None
    position_locale = raw_position if isinstance(raw_position, dict) else {}
    positions_done: set[str] = set()
    for mission_id, record in missions.items():
        note = record.get("desc")
        if isinstance(note, str) and note:
            mission_table[mission_id] = note
        raw_states = record.get("states")
        if not isinstance(raw_states, dict):
            continue
        for state_key, state in raw_states.items():
            if not isinstance(state_key, str) or not isinstance(state, dict):
                continue
            desc = state.get("desc")
            if isinstance(desc, str) and desc:
                state_table[state_key] = desc
            code = state.get("positionCode")
            if isinstance(code, str) and code and code not in positions_done:
                text = position_locale.get(f"Name/{code}")
                if isinstance(text, str) and text:
                    position_table[code] = text
                positions_done.add(code)
            for field in ("startDialogs", "alertDialogs"):
                for dialog in state.get(field) or []:
                    if not isinstance(dialog, dict):
                        continue
                    key = dialog.get("key")
                    if not isinstance(key, str) or not key:
                        continue
                    text = position_locale.get(f"Dialog/{key}")
                    if isinstance(text, str) and text:
                        dialog_table[key] = text


def _mission_time(value: Any) -> dict[str, int] | None:
    if not isinstance(value, dict):
        return None
    return {field: int(value.get(field) or 0) for field in ("year", "month", "stage", "day")}


def _mission_flags(items: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for change in items or []:
        if not isinstance(change, dict):
            continue
        key = str(change.get("key") or "")
        if not key:
            continue
        out.append({
            "key": key,
            "value": int(change.get("value") or 0),
            "note": str(change.get("note") or ""),
        })
    return out


def _emit_missions(reporter: Reporter,
                   missions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    payload: dict[str, Any] = {"schema": SCHEMA_VERSION, "missions": {}}
    state_count = 0
    condition_count = 0
    dialog_count = 0
    flag_count = 0
    for mission_id, record in sorted(missions.items()):
        raw_states = record.get("states")
        states_map: dict[str, dict[str, Any]] = {}
        if isinstance(raw_states, dict):
            for state_key, state in raw_states.items():
                if not isinstance(state_key, str) or not isinstance(state, dict):
                    continue
                raw_time = state.get("time") if isinstance(state.get("time"), dict) else {}
                conditions: list[dict[str, Any]] = []
                for item in state.get("conditions") or []:
                    if not isinstance(item, dict):
                        continue
                    expr = item.get("expr")
                    if not isinstance(expr, dict):
                        continue
                    conditions.append({
                        "note": str(item.get("note") or ""),
                        "expr": expr,
                    })
                dialogs: dict[str, list[dict[str, str]]] = {}
                for field in ("startDialogs", "alertDialogs"):
                    items: list[dict[str, str]] = []
                    for dialog in state.get(field) or []:
                        if not isinstance(dialog, dict):
                            continue
                        key = str(dialog.get("key") or "")
                        if not key:
                            continue
                        items.append({
                            "portrait": str(dialog.get("portrait") or ""),
                            "key": key,
                        })
                    dialogs[field] = items
                    dialog_count += len(items)
                flags_true = _mission_flags(state.get("modifyFlagsTrue"))
                flags_false = _mission_flags(state.get("modifyFlagsFalse"))
                flag_count += len(flags_true) + len(flags_false)
                states_map[state_key] = {
                    "active": bool(state.get("active", True)),
                    "position": int(state.get("position") or 0),
                    "positionCode": str(state.get("positionCode") or ""),
                    "beforeMain": bool(state.get("beforeMain")),
                    "start": str(state.get("start") or ""),
                    "next": str(state.get("next") or ""),
                    "time": {
                        "check": bool(raw_time.get("check")),
                        "type": int(raw_time.get("type") or 0),
                        "specific": _mission_time(raw_time.get("specific")),
                        "min": _mission_time(raw_time.get("min")),
                        "max": _mission_time(raw_time.get("max")),
                        "period": int(raw_time.get("period") or 0),
                    },
                    "conditions": conditions,
                    "startDialogs": dialogs["startDialogs"],
                    "alertDialogs": dialogs["alertDialogs"],
                    "modifyFlagsTrue": flags_true,
                    "modifyFlagsFalse": flags_false,
                }
                condition_count += len(conditions)
                state_count += 1
        payload["missions"][mission_id] = {
            "main": bool(record.get("main")),
            "init": str(record.get("init") or ""),
            "states": states_map,
        }
    size = write_missions(SITE_DATA_DIR / "missions.js", payload)
    reporter.info(
        f"mission definitions: {len(payload['missions'])} missions,"
        f" {state_count} states, {condition_count} conditions,"
        f" {dialog_count} dialogs, {flag_count} flag changes, {format_bytes(size)}")
    return {
        "size": size,
        "missions": len(payload["missions"]),
        "states": state_count,
        "conditions": condition_count,
        "dialogs": dialog_count,
        "flags": flag_count,
    }


def render_language(lang: str, locale: dict, node_ids: list[str],
                    models: dict[str, ScriptAnalysis], chapter_id_by_script: dict[str, str],
                    chapters, edges: list[Edge],
                    lore: dict[str, str] | None, name_registry: labels.NameTables,
                    stat_notes: dict[str, str] | None = None,
                    battles: BattleCards | None = None,
                    position_targets: dict[str, tuple[str, ...]] | None = None
                    ) -> LanguageRender:
    started = time.time()
    renderer = Renderer(locale, lore_fallback=lore, name_registry=name_registry,
                        stat_notes=stat_notes, battles=battles,
                        position_targets=position_targets)
    script_rows: dict[str, list] = {}
    word_counts: dict[str, list[list[int]]] = {}
    for sid in node_ids:
        counter = TextCounter()
        renderer.counter = counter
        rows = renderer.render_rows(models[sid].beats)
        if rows:
            script_rows[sid] = rows
        word_counts[sid] = counter.counts_vector()

    chapter_counts = {chapter.id: empty_counts() for chapter in chapters}
    for sid in node_ids:
        chapter_key = chapter_id_by_script[sid]
        if chapter_key in chapter_counts:
            add_counts(chapter_counts[chapter_key], word_counts[sid])

    edge_labels: dict[str, str] = {}
    for index, edge in enumerate(edges):
        if not edge.label:
            continue
        label = renderer.edge_label(edge.label)
        if label:
            edge_labels[str(index)] = label

    metrics = {
        "options": renderer.option_count,
        "locked": renderer.locked_count,
        "rich": renderer.rich_count,
        "think": renderer.think_count,
        "think_named": renderer.think_named_count,
        "lore": renderer.lore_count,
        "lore_fallback": renderer.lore_fallback_count,
        "lore_missing": renderer.lore_missing_count,
        "lore_missing_samples": renderer.lore_missing[:40],
        "missing": renderer.missing_count,
        "battles": renderer.battle_count,
        "battle_missing": renderer.battle_missing,
    }
    return LanguageRender(
        lang=lang,
        script_rows=script_rows,
        word_counts=word_counts,
        chapter_counts=chapter_counts,
        characters=renderer.character_table(),
        titles=renderer.title_table(),
        edge_labels=edge_labels,
        metrics=metrics,
        missing=renderer.missing,
        seconds=round(time.time() - started, 1),
    )


def _write_language(render: LanguageRender, names: dict[str, dict[str, str]],
                    shard_by_node: dict[str, str], shards: list[dict],
                    ) -> tuple[list[tuple[str, int]], dict[str, Any]]:
    lang = render.lang
    parts: list[tuple[str, int]] = []
    shard_keys = [shard["key"] for shard in shards]
    payload = text_payload(
        lang=lang,
        characters=render.characters,
        titles=render.titles,
        names=names,
        edge_labels=render.edge_labels,
        scripts={},
        shard_keys=shard_keys,
        missing_key_count=render.metrics["missing"],
        missing_keys=render.missing[:200],
    )
    head_size = write_text_head(SITE_DATA_DIR / f"text-{lang}-head.js", lang, payload)
    parts.append((f"text-{lang}-head.js", head_size))
    buckets: dict[str, dict[str, list]] = {key: {} for key in shard_keys}
    for sid in render.script_rows:
        key = shard_by_node.get(sid)
        if key in buckets:
            buckets[key][sid] = render.script_rows[sid]
    shard_bytes = 0
    for shard in shards:
        written = write_text_shard(
            SITE_DATA_DIR / f"text-{lang}-{shard['key']}.js", lang, buckets[shard["key"]])
        parts.append((f"text-{lang}-{shard['key']}.js", written))
        shard_bytes += written

    report = {
        "scripts": len(render.script_rows),
        "characters": len(render.characters),
        "titles": len(render.titles),
        "options": render.metrics["options"],
        "locked_options": render.metrics["locked"],
        "rich_text": render.metrics["rich"],
        "think": render.metrics["think"],
        "think_named": render.metrics["think_named"],
        "lore": render.metrics["lore"],
        "lore_fallback": render.metrics["lore_fallback"],
        "lore_missing": render.metrics["lore_missing"],
        "lore_missing_samples": render.metrics["lore_missing_samples"],
        "edge_labels": len(render.edge_labels),
        "missing_keys": render.metrics["missing"],
        "missing_samples": render.missing[:40],
        "head_bytes": head_size,
        "shard_count": len(shards),
        "shard_bytes": shard_bytes,
        "seconds": render.seconds,
    }
    return parts, report


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
        return read_build_info(
            session, steamapps_dir(layout.install_dir), install_folder_name(layout.install_dir))
    finally:
        session.close()


def _gap_report(blob: dict[str, Any]) -> dict[str, Any]:
    gaps = [gap for gap in (blob.get("gaps") or []) if isinstance(gap, dict)]
    return {"total": len(gaps), "by_reason": count_by_reason(gaps)}


def _time_label(rounds: float) -> str:
    year, month, period = date_parts_of(rounds)
    return f"Y{year}-M{month}-P{period}"


def _report_graph_and_sources(reporter: Reporter, edges: list[Edge],
                              position_edges: list[Edge], unresolved_jumps: list[str],
                              scene_total: int, chapters: list[Any],
                              time_by_script: dict[str, int],
                              system: SystemEntries, position_stats: dict[str, int],
                              entry_probe: dict[str, Any]) -> None:
    reporter.stage(STAGE_GRAPH)
    reporter.info(
        f"{len(edges)} edges ({len(position_edges)} position),"
        f" {len(unresolved_jumps)} dynamic jumps"
    )
    reporter.info(f"{scene_total} scene switches")
    reporter.info(f"{len(chapters)} chapters; {len(time_by_script)} scripts with a fixed date")
    if time_by_script:
        reporter.info(
            f"time range: {_time_label(min(time_by_script.values()))}"
            f" -> {_time_label(max(time_by_script.values()))}")
    reporter.info(
        f"system entries: {len(system.hardcoded)} hardcoded,"
        f" positions exact {position_stats['exact_names']} + prefix {position_stats['prefix_names']}"
        f"/{position_stats['names']}"
    )
    probe_summary = summarize_probe(dict(entry_probe))
    if not probe_summary["ok"]:
        reporter.info(f"system position probe: {probe_summary['reason']}")


def _pack_shards(node_ids: list[str], chapter_index_by_script: dict[str, int],
                 chapters: list[Any], script_rows: dict[str, Any], reporter: Reporter,
                 ) -> tuple[dict[str, str], list[dict[str, Any]]]:
    sizes = {
        sid: len(dump_json(script_rows.get(sid, [])).encode("utf-8")) for sid in node_ids
    }
    shard_by_node, shards = pack_scripts(
        node_ids, sizes, chapter_index_by_script, [chapter.id for chapter in chapters])
    largest = max((shard["bytes"] for shard in shards), default=0)
    reporter.info(
        f"script shards: {len(shards)} (largest {format_bytes(largest)},"
        f" budget {format_bytes(sum(shard['bytes'] for shard in shards))})"
    )
    return shard_by_node, shards


def _emit_checkpoints(reporter: Reporter, locale: dict[str, Any],
                      name_registry: labels.NameTables,
                      stat_notes: dict[str, str] | None = None) -> dict[str, Any]:
    blob = read_json(CHECKPOINTS_PATH)
    if not isinstance(blob, dict) or blob.get("version") != CHECKPOINT_VERSION:
        if blob:
            reporter.warn("data/checkpoints.json version mismatch; rerun extract.py")
        blob = {}
    conditions = checkpoint_conditions.drop_invalid_conditions(blob.get("items"))
    labels.canonicalize_checkpoints(conditions, locale, name_registry, stat_notes)
    checkpoint_conditions.strip_notes(conditions)
    variants = sum(len(condition.get("variants") or []) for condition in conditions.values())
    parts: list[dict[str, Any]] = []
    mapping: dict[str, int] = {}
    if conditions:
        mapping = shard_index_by_key(sorted(conditions), CHECKPOINT_SHARDS)
        parts = write_checkpoint_shards(SITE_DATA_DIR, conditions, mapping)
        reporter.info(
            f"checkpoint conditions: {len(conditions)} in {len(parts)} shards,"
            f" {variants} variants, {format_bytes(sum(item['bytes'] for item in parts))} total"
        )
    else:
        reporter.info("checkpoint conditions: none")
    return {
        "blob": blob,
        "conditions": conditions,
        "variants": variants,
        "parts": parts,
        "mapping": mapping,
    }


def _counts_report(edges: list[Edge], node_ids: list[str], in_degree: dict[str, int],
                   out_degree: dict[str, int], position_in_degree: dict[str, int],
                   empty_ids: set[str], simplified_ids: set[str],
                   facets: dict[str, Any],
                   checkpoints: dict[str, Any]) -> BuildCounts:
    edge_counts = {
        kind: sum(1 for edge in edges if edge.kind == kind) for kind in vocab.EDGE_KINDS
    }
    node_counts = {
        "empty": len(empty_ids),
        "simplified_only": len(simplified_ids),
        "no_incoming": sum(1 for sid in node_ids if in_degree[sid] == 0),
        "no_incoming_after_system": sum(
            1 for sid in node_ids if in_degree[sid] == 0 and position_in_degree[sid] == 0),
        "position_in": sum(1 for sid in node_ids if position_in_degree[sid] > 0),
        "no_outgoing": sum(1 for sid in node_ids if out_degree[sid] == 0),
    }
    facet_report = {
        "fields": list(vocab.FACET_KINDS),
        "speakers": len({key for row in facets.values() for key in row.speakers}),
        "flags": len({key for row in facets.values() for key in row.flags}),
        "checks": len({key for row in facets.values() for key in row.checks}),
        "stats": len({key for row in facets.values() for key in row.stats}),
        "relations": len({key for row in facets.values() for key in row.relations}),
        "endings": len({key for row in facets.values() for key in row.endings}),
        "scripts_with_ending": sum(1 for row in facets.values() if row.endings),
        "scripts_with_flag": sum(1 for row in facets.values() if row.flags),
        "scripts_with_check": sum(1 for row in facets.values() if row.checks),
        "scripts_with_lock": sum(1 for row in facets.values() if row.lock_count),
        "scripts_with_dice": sum(1 for row in facets.values() if row.dice_check_count),
        "scripts_with_options": sum(1 for row in facets.values() if row.option_count),
    }
    parts = checkpoints["parts"]
    conditions = checkpoints["conditions"]
    checkpoint_report = {
        "resolved": len(conditions),
        "variants": checkpoints["variants"],
        "bytes": sum(item["bytes"] for item in parts),
        "mode": "shards" if parts else "none",
        "shards": len(parts),
        "by_kind": checkpoint_conditions.count_by_kind(conditions),
        "gaps": _gap_report(checkpoints["blob"]),
    }
    return BuildCounts(edge_counts, node_counts, facet_report, checkpoint_report)


def _wordcount_report(lang: str, wordcount_rows: dict[str, Any],
                      reporter: Reporter) -> dict[str, Any]:
    sums = sum_counts(wordcount_rows["chapters"])
    report = {
        "chapters": len(wordcount_rows["chapters"]),
        "scripts": len(wordcount_rows["scripts"]),
        "by_kind": {
            kind: {"zh": pair[0], "en": pair[1], "sum": pair[0] + pair[1]}
            for kind, pair in zip(TEXT_KINDS, sums)
        },
        "total": {
            "zh": sum(pair[0] for pair in sums),
            "en": sum(pair[1] for pair in sums),
            "sum": sum(pair[0] + pair[1] for pair in sums),
        },
    }
    reporter.info(
        f"word count {lang}: {report['total']['sum']} chars"
        f" ({report['scripts']} scripts)"
    )
    return report


def _prune_stale(parts: list[tuple[str, int]], reporter: Reporter) -> None:
    keep = {name for name, _ in parts}
    removed = prune(SITE_DATA_DIR, keep)
    if removed:
        reporter.info(f"removed {removed} stale artifacts")


def _required_positions(models: dict[str, ScriptAnalysis]) -> dict[str, list[str]]:
    return {
        sid: list(model.positions) for sid, model in models.items() if model.positions
    }


def _time_by_script(models: dict[str, ScriptAnalysis]) -> dict[str, int]:
    return {sid: model.time for sid, model in models.items() if model.time is not None}


def _collect(models: dict[str, ScriptAnalysis],
             entry_probe: dict[str, Any]) -> CollectedGraph:
    collected = collect_edges(models)
    edges = list(collected.edges)
    node_ids = sorted(models)
    system = build_system_entries(node_ids)
    position_edges, position_stats = expand_positions(
        _required_positions(models), node_ids, collected.adjacency,
        entry_probe.get("position_targets") or {})
    edges.extend(position_edges)
    position_in_degree: dict[str, int] = {sid: 0 for sid in node_ids}
    for edge in position_edges:
        position_in_degree[edge.target] += 1
    return CollectedGraph(
        collected, edges, position_edges, system, position_stats, position_in_degree,
        position_target_map(position_edges))


def run_build(*, langs: tuple[str, ...], default_lang: str,
              use_cache: bool = True,
              jobs: int | None = None,
              reporter: Reporter | None = None) -> BuildResult:
    reporter = reporter or Reporter()
    reporter.configure(BUILD_STAGES)
    if not langs:
        reporter.error("no language selected; pass --langs zh-tw")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if TEXT_SOURCE_LANG not in langs:
        reporter.error(f"{TEXT_SOURCE_LANG} is required; the reader ships the source text only")
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)
    if len(langs) > 1:
        reporter.warn(f"only {TEXT_SOURCE_LANG} is rendered; the other languages are derived at runtime")

    sources = _load_sources(reporter)
    if not sources:
        return BuildResult(False, 0, 0, 0, {}, REPORT_PATH)

    manifest = read_json(MANIFEST_PATH)
    if not isinstance(manifest, dict):
        manifest = {}
    anomalies = manifest.get("anomalies") or {}
    simplified_ids = set(anomalies.get("simplified_only_scripts") or [])
    empty_ids = set(anomalies.get("empty_scripts") or [])

    models, reused, failed = analyze_all(sources, use_cache, reporter, jobs)
    failed_scripts = [
        (sid, model.error) for sid, model in sorted(models.items()) if model.error
    ]
    for sid, error in failed_scripts[:20]:
        reporter.warn(f"{sid} failed to parse: {error}")
    if len(failed_scripts) > 20:
        reporter.warn(f"{len(failed_scripts) - 20} more scripts failed to parse")

    entry_probe = read_json(ENTRIES_PATH)
    if not isinstance(entry_probe, dict) or entry_probe.get("version") != ENTRY_VERSION:
        if entry_probe:
            reporter.warn("data/entries.json version mismatch; rerun extract.py")
        entry_probe = {}
    collected_graph = _collect(models, entry_probe)
    collected = collected_graph.collected
    edges = collected_graph.edges
    position_edges = collected_graph.position_edges
    system = collected_graph.system
    position_stats = collected_graph.position_stats
    position_in_degree = collected_graph.position_in_degree
    unresolved_jumps = collected.unresolved_jumps
    scene_total = sum(model.scene_count for model in models.values())
    node_ids = sorted(models)
    chapters, chapter_index_by_id = build_chapters(node_ids)
    chapter_id_by_script = {sid: chapter_id(*classify(sid)) for sid in node_ids}
    chapter_index_by_script = {
        sid: chapter_index_by_id[chapter_id_by_script[sid]] for sid in node_ids
    }

    locale = _load_locale(TEXT_SOURCE_LANG, reporter)
    if locale is None:
        return BuildResult(False, len(node_ids), len(edges), len(chapters), {}, REPORT_PATH)
    lore = _load_lore(reporter)
    stat_notes = _load_stat_notes(reporter)
    mission_items = _load_missions(reporter)
    battle_items = _load_battles(reporter)
    name_registry: labels.NameTables = {}
    _register_mission_names(mission_items, locale, name_registry)
    labels.canonicalize_missions(mission_items, locale, name_registry, stat_notes)
    battle_cards = (BattleCards(battle_items, locale, name_registry, stat_notes)
                    if battle_items else None)

    battle_facets = collect_battle_facets(models, battle_cards)
    facets = {
        sid: merge(collect_facets(models[sid].beats, models[sid].checks),
                   battle_facets.get(sid))
        for sid in node_ids
    }
    time_by_script = _time_by_script(models)

    _report_graph_and_sources(reporter, edges, position_edges, unresolved_jumps, scene_total,
                              chapters, time_by_script, system, position_stats, entry_probe)

    nodes = assemble_nodes(
        node_ids, models, chapter_index_by_script, collected.out_degree, collected.in_degree,
        facets, empty_ids, simplified_ids, time_by_script,
    )

    SITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    reporter.stage(STAGE_RENDER)
    checkpoints = _emit_checkpoints(reporter, locale, name_registry, stat_notes)
    missions = _emit_missions(reporter, mission_items)
    checkpoint_mapping = checkpoints["mapping"]
    reads = var_reads.collect_reads(checkpoints["conditions"])

    render = render_language(
        TEXT_SOURCE_LANG, locale, node_ids, models, chapter_id_by_script, chapters, edges,
        lore, name_registry, stat_notes, battle_cards, collected_graph.position_targets)
    names = labels.finalize_registry(name_registry)
    metrics = render.metrics
    reporter.info(
        f"battle cards: {metrics['battles']} rendered, {metrics['battle_missing']} missing levels"
    )
    reporter.info(
        f"rendered {TEXT_SOURCE_LANG}: {len(render.script_rows)} scripts,"
        f" {metrics['options']} options"
        f" ({metrics['locked']} locked), {metrics['rich']} rich text,"
        f" {metrics['missing']} missing keys"
    )
    reporter.info(
        f"inner monologue {metrics['think']} ({metrics['think_named']} with a speaker),"
        f" lore {metrics['lore']} (fallback {metrics['lore_fallback']},"
        f" unresolved {metrics['lore_missing']})"
    )

    shard_by_node, shards = _pack_shards(
        node_ids, chapter_index_by_script, chapters, render.script_rows, reporter)

    parts, language_report = _write_language(render, names, shard_by_node, shards)
    languages: dict[str, Any] = {TEXT_SOURCE_LANG: language_report}
    reporter.info(
        f"wrote {TEXT_SOURCE_LANG}: head {format_bytes(language_report['head_bytes'])}"
        f", {language_report['shard_count']} shards"
        f" {format_bytes(language_report['shard_bytes'])}"
    )

    wordcount_payload = {
        "schema": SCHEMA_VERSION,
        "kinds": list(TEXT_KINDS),
        "langs": {
            TEXT_SOURCE_LANG: {
                "chapters": render.chapter_counts,
                "scripts": render.word_counts,
            }
        },
    }
    wordcount_size = write_wordcount(SITE_DATA_DIR / "wordcount.js", wordcount_payload)
    parts.append(("wordcount.js", wordcount_size))
    parts.extend((item["name"], item["bytes"]) for item in checkpoints["parts"])
    parts.append(("missions.js", missions["size"]))

    reads_size = write_var_reads(SITE_DATA_DIR / "var-reads.js", reads)
    parts.append(("var-reads.js", reads_size))
    reporter.info(
        "checkpoint reads: "
        + ", ".join(f"{kind} {len(bucket)}" for kind, bucket in reads.items())
        + f", {format_bytes(reads_size)}")

    game_info = _game_info(manifest)
    if game_info.version or game_info.build:
        reporter.info("game version: " + " · ".join(piece for piece in (
            f"v{game_info.version}" if game_info.version else "",
            f"build {game_info.build}" if game_info.build else "",
            f"updated {game_info.updated}" if game_info.updated else "",
        ) if piece))
    else:
        reporter.info("game version: unavailable (normal when the game is not installed)")

    display_langs = [TEXT_SOURCE_LANG, *DERIVED_LANGS]
    graph_payload = {
        "schema": SCHEMA_VERSION,
        "meta": {
            "generated": time.strftime("%Y-%m-%d %H:%M:%S"),
            "game": game_info.to_wire(),
            "langs": display_langs,
            "defaultLang": default_lang,
            "sourceLang": TEXT_SOURCE_LANG,
            "vocab": vocab.wire_payload(),
            "assets": assets_payload(),
            "calendar": {"roundsPerYear": ROUNDS_PER_YEAR, "roundsPerMonth": ROUNDS_PER_MONTH},
            "counts": {
                "scripts": len(node_ids),
                "edges": len(edges),
                "chapters": len(chapters),
                "unresolvedJumps": len(unresolved_jumps),
            },
            "shards": shards,
            "shardByNode": shard_by_node,
            "checkpointShardByKey": checkpoint_mapping,
            "systemEntries": system.hardcoded,
        },
        "chapters": [chapter.to_wire() for chapter in chapters],
        "nodes": [node.to_wire() for node in nodes],
        "edges": [edge.to_wire(index) for index, edge in enumerate(edges)],
    }
    graph_size = write_graph(SITE_DATA_DIR / "graph.js", graph_payload)
    parts.append(("graph.js", graph_size))

    _prune_stale(parts, reporter)

    counts = _counts_report(
        edges, node_ids, collected.in_degree, collected.out_degree, position_in_degree,
        empty_ids, simplified_ids, facets, checkpoints)
    wordcount_report = _wordcount_report(
        TEXT_SOURCE_LANG, wordcount_payload["langs"][TEXT_SOURCE_LANG], reporter)

    battle_manifest = manifest.get("battle_stats") or {}
    battle_report = {
        "levels": len(battle_items),
        "used": metrics.get("battles", 0),
        "missing": metrics.get("battle_missing", 0),
        "extracted": battle_manifest.get("levels", 0),
        "by_kind": battle_manifest.get("by_kind") or {},
        "events": battle_manifest.get("events", 0),
        "actions": battle_manifest.get("actions", 0),
        "elapsed": battle_manifest.get("elapsed", 0),
    }
    lore_manifest = manifest.get("lore_stats") or {}
    lore_report = {
        "items": len(lore),
        "wanted": lore_manifest.get("wanted", 0),
        "resolved": lore_manifest.get("resolved", 0),
        "unresolved": lore_manifest.get("unresolved", 0),
        "fallback": metrics.get("lore_fallback", 0),
        "missing": metrics.get("lore_missing", 0),
        "samples": metrics.get("lore_missing_samples", []),
    }
    mission_manifest = manifest.get("mission_stats") or {}
    mission_report = {
        "missions": missions["missions"],
        "states": missions["states"],
        "conditions": missions["conditions"],
        "dialogs": missions["dialogs"],
        "flags": missions["flags"],
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
        script_count=len(node_ids),
        edge_counts=counts.edge_counts,
        node_counts=counts.node_counts,
        system_entries={
            "hardcoded": system.hardcoded,
            "hardcoded_missing": system.absent_hardcoded_ids,
            "position": position_stats,
            "asset_probe": summarize_probe(dict(entry_probe)),
        },
        facets=counts.facet_report,
        checkpoints=counts.checkpoint_report,
        battles=battle_report,
        lore=lore_report,
        missions=mission_report,
        wordcount={"bytes": wordcount_size, "langs": wordcount_report},
        time_stats={
            "explicit": len(time_by_script),
            "range": [
                list(date_parts_of(min(time_by_script.values()))),
                list(date_parts_of(max(time_by_script.values()))),
            ] if time_by_script else None,
            "scripts": sorted(time_by_script),
        },
        chapters=[chapter.to_wire() for chapter in chapters],
        text_artifact={
            "shard_count": len(shards),
            "largest_shard_kb": max(
                (round(shard["bytes"] / 1024) for shard in shards), default=0),
            "shards": shards,
        },
        languages=languages,
        unresolved_jumps=unresolved_jumps,
        analysis={
            "failed": failed,
            "cache_reused": reused,
            "scene_switches": scene_total,
        },
        artifacts=[{"name": name, "size": size} for name, size in parts],
    )
    write_report(REPORT_PATH, report_payload)

    reporter.stage(STAGE_OUTPUT)
    reporter.info("graph.js " + format_bytes(graph_size) + ", " + ", ".join(
        f"{name} {format_bytes(size)}" for name, size in parts
        if name != "graph.js" and not name.startswith("checkpoints-")))
    reporter.info(f"{len(node_ids)} nodes / {len(edges)} edges / {len(chapters)} chapters")
    reporter.info(f"report -> {REPORT_PATH}")
    if failed:
        reporter.warn(
            f"{failed} scripts failed to parse and were degraded to empty text (see report.json)")
    if not render.script_rows:
        reporter.error("all scripts rendered empty, check the extraction output")
        return BuildResult(
            False, len(node_ids), len(edges), len(chapters), languages, REPORT_PATH)
    return BuildResult(True, len(node_ids), len(edges), len(chapters), languages, REPORT_PATH)
