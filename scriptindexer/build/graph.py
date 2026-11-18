from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace

from ..game.unity_fields import HARDCODED_ENTRIES
from ..schema import EdgeRow, Facets, MissionDocument, NodeFlags, NodeRow, SystemEntryRow
from ..script_model import Edge, ScriptAnalysis
from ..vocab import EDGE_MISSION, EDGE_POSITION

MAX_EDGE_LABEL = 60


@dataclass(frozen=True)
class CollectedEdges:
    edges: list[Edge]
    unresolved_jumps: list[str]
    adjacency: dict[str, set[str]]
    out_degree: dict[str, int]
    in_degree: dict[str, int]


def collect_edges(models: Mapping[str, ScriptAnalysis]) -> CollectedEdges:
    ids = set(models)
    seen: dict[tuple[str, str, str], int] = {}
    edges: list[Edge] = []
    unresolved_jumps: list[str] = []
    adjacency: dict[str, set[str]] = {}
    out_degree: dict[str, int] = {sid: 0 for sid in sorted(models)}
    in_degree: dict[str, int] = {sid: 0 for sid in sorted(models)}

    for sid, model in models.items():
        for edge in model.edges:
            if edge.target not in ids:
                unresolved_jumps.append(f"{sid} -> {edge.target} (missing target)")
                continue
            key = (sid, edge.target, edge.kind)
            index = seen.get(key)
            if index is not None:
                label = edge.label
                if label and label not in edges[index].label:
                    merged = (edges[index].label + " / " + label)[:MAX_EDGE_LABEL]
                    edges[index] = replace(edges[index], label=merged)
                continue
            seen[key] = len(edges)
            edges.append(Edge(sid, edge.target, edge.kind, (edge.label or "")[:MAX_EDGE_LABEL]))
            adjacency.setdefault(sid, set()).add(edge.target)
            out_degree[sid] += 1
            in_degree[edge.target] += 1

    for sid, model in models.items():
        for item in model.unresolved_jumps[:1]:
            unresolved_jumps.append(f"{sid} contains dynamic jumps: {item}")

    return CollectedEdges(edges, unresolved_jumps, adjacency, out_degree, in_degree)


def _prefix_targets(name: str, ids: Sequence[str]) -> list[str]:
    prefix = name.lower() + "_"
    return [sid for sid in ids if sid.lower().startswith(prefix)]


def temp_target_map(
    models: Mapping[str, ScriptAnalysis], ids: Sequence[str]
) -> dict[str, tuple[str, ...]]:
    id_set = set(ids)
    found: dict[str, set[str]] = {}
    for model in models.values():
        for slot, targets in model.temp_writes.items():
            found.setdefault(slot, set()).update(target for target in targets if target in id_set)
    return {slot: tuple(sorted(targets)) for slot, targets in sorted(found.items())}


def travel_target_map(
    models: Mapping[str, ScriptAnalysis], edges: Iterable[Edge], ids: Sequence[str]
) -> dict[str, tuple[str, ...]]:
    id_set = set(ids)
    sources: dict[str, set[str]] = {}
    for edge in edges:
        sources.setdefault(edge.target, set()).add(edge.source)
    found: dict[str, tuple[str, ...]] = {}
    for sid, srcs in sources.items():
        candidates: set[str] = set()
        for src in srcs:
            model = models.get(src)
            if model is None:
                continue
            candidates.update(target for target in model.travel_writes if target in id_set)
        if candidates:
            found[sid] = tuple(sorted(candidates))
    return found


def mission_start_map(missions: MissionDocument | None) -> dict[str, str]:
    if missions is None:
        return {}
    starts: dict[str, str] = {}
    for record in missions.items.values():
        for state_key, state in record.states.items():
            if state.start:
                starts[state_key] = state.start
    return starts


def build_mission_edges(
    models: Mapping[str, ScriptAnalysis],
    starts: Mapping[str, str],
    ids: Sequence[str],
) -> list[Edge]:
    id_set = set(ids)
    seen: set[tuple[str, str, str]] = set()
    edges: list[Edge] = []
    for sid in sorted(models):
        for state_key in models[sid].mission_states:
            target = starts.get(state_key, "")
            if not target or target not in id_set or target == sid:
                continue
            key = (sid, target, state_key)
            if key in seen:
                continue
            seen.add(key)
            edges.append(Edge(sid, target, EDGE_MISSION, state_key))
    return edges


def position_target_map(edges: Iterable[Edge]) -> dict[str, tuple[str, ...]]:
    found: dict[str, set[str]] = {}
    for edge in edges:
        if edge.kind != EDGE_POSITION or not edge.label:
            continue
        found.setdefault(edge.label, set()).add(edge.target)
    return {name: tuple(sorted(targets)) for name, targets in sorted(found.items())}


def expand_positions(
    required_positions: Mapping[str, list[str]],
    ids: Sequence[str],
    adjacency: dict[str, set[str]],
    position_targets: Mapping[str, Sequence[str]] | None = None,
) -> tuple[list[Edge], dict[str, object]]:
    edges: list[Edge] = []
    resolved: dict[str, int] = {}
    exact_names: list[str] = []
    prefix_names: list[str] = []
    unresolved: list[str] = []
    target_map = position_targets or {}
    id_set = set(ids)
    for src in sorted(required_positions):
        for name in required_positions[src]:
            exact_targets = [sid for sid in target_map.get(name, ()) if sid in id_set]
            if exact_targets:
                targets = exact_targets
                exact_names.append(name)
            else:
                targets = _prefix_targets(name, ids)
                if targets:
                    prefix_names.append(name)
            if not targets:
                unresolved.append(name)
                continue
            resolved[name] = resolved.get(name, 0) + len(targets)
            existing = adjacency.setdefault(src, set())
            for dst in targets:
                if dst in existing:
                    continue
                existing.add(dst)
                edges.append(Edge(src, dst, EDGE_POSITION, name))
    stats = {
        "names": len({name for names in required_positions.values() for name in names}),
        "resolved_names": len(resolved),
        "exact_names": len(set(exact_names)),
        "prefix_names": len(set(prefix_names)),
        "targets": sum(resolved.values()),
        "edges": len(edges),
        "unresolved": sorted(set(unresolved))[:40],
    }
    return edges, stats


@dataclass
class SystemEntries:
    hardcoded: list[SystemEntryRow]
    absent_hardcoded_ids: list[str]


def build_system_entries(ids: Iterable[str]) -> SystemEntries:
    id_set = set(ids)
    hardcoded = [
        SystemEntryRow(id=item["id"], label=item["label"], origin=item["origin"])
        for item in HARDCODED_ENTRIES
        if item["id"] in id_set
    ]
    absent = [item["id"] for item in HARDCODED_ENTRIES if item["id"] not in id_set]
    return SystemEntries(hardcoded, absent)


def assemble_nodes(
    node_ids: Sequence[str],
    models: Mapping[str, ScriptAnalysis],
    chapter_index_by_script: Mapping[str, int],
    out_degree: Mapping[str, int],
    in_degree: Mapping[str, int],
    facets: Mapping[str, Facets],
    empty_ids: set[str],
    simplified_ids: set[str],
    time_by_script: Mapping[str, int],
) -> list[NodeRow]:
    nodes: list[NodeRow] = []
    for sid in node_ids:
        nodes.append(
            NodeRow(
                id=sid,
                chapter_index=chapter_index_by_script.get(sid, 0),
                out_degree=out_degree.get(sid, 0),
                in_degree=in_degree.get(sid, 0),
                say_count=models[sid].say_count,
                flags=NodeFlags(
                    is_empty=sid in empty_ids,
                    is_simplified_only=sid in simplified_ids,
                    has_no_outgoing=out_degree.get(sid, 0) == 0,
                    has_no_incoming=in_degree.get(sid, 0) == 0,
                ),
                facets=facets.get(sid, Facets()),
                mission_states=list(models[sid].mission_states),
                time=time_by_script.get(sid),
            )
        )
    return nodes


def edge_rows(edges: Sequence[Edge]) -> list[EdgeRow]:
    return [
        EdgeRow(
            index=index, source=edge.source, target=edge.target, kind=edge.kind, label=edge.label
        )
        for index, edge in enumerate(edges)
    ]
