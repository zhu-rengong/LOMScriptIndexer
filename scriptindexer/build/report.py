from pathlib import Path
from typing import Any

from ..jsonio import write_json
from ..versions import SCHEMA_VERSION


def build_report_payload(*, generated: str, script_count: int, edge_counts: dict[str, int],
                         node_counts: dict[str, int], system_entries: dict[str, Any],
                         facets: dict[str, Any], checkpoints: dict[str, Any],
                         battles: dict[str, Any], lore: dict[str, Any],
                         missions: dict[str, Any],
                         wordcount: dict[str, Any], time_stats: dict[str, Any],
                         chapters: list[dict[str, Any]], text_artifact: dict[str, Any],
                         languages: dict[str, Any], unresolved_jumps: list[str],
                         analysis: dict[str, Any],
                         artifacts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema": SCHEMA_VERSION,
        "generated": generated,
        "scripts": script_count,
        "edges": edge_counts,
        "nodes": node_counts,
        "entries": system_entries,
        "facets": facets,
        "checkpoints": checkpoints,
        "battles": battles,
        "lore": lore,
        "missions": missions,
        "wordcount": wordcount,
        "time": time_stats,
        "chapters": chapters,
        "text": text_artifact,
        "languages": languages,
        "unresolved_jumps": unresolved_jumps[:200],
        "analysis": analysis,
        "artifacts": artifacts,
    }


def write_report(path: Path, payload: dict[str, Any]) -> int:
    return write_json(path, payload, indent=2)


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    return f"{size / (1024 * 1024):.2f} MB"
