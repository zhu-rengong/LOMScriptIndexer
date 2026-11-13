import time
from typing import Any

from ..console import Reporter
from ..schema import StatRecord, StatsDocument, source_version
from .assets import AssetSession
from .unity_fields import STAT_CLASS, STAT_FIELDS
from .unity_objects import absent_fields, coerce_int, collapse_text


def extract(
    session: AssetSession, reporter: Reporter
) -> tuple[dict[str, StatRecord], dict[str, Any]]:
    started = time.time()
    warnings = session.warnings
    items: dict[str, StatRecord] = {}
    for path, obj, cls in session.iter_class({STAT_CLASS}):
        tree = session.typetree(path, obj)
        if not isinstance(tree, dict):
            continue
        missing = absent_fields(tree, STAT_FIELDS)
        if missing:
            session.warn_once(
                ("fields", cls, *missing),
                f"{cls} is missing {', '.join(missing)}; stat names may be incomplete",
            )
        key = collapse_text(tree.get("m_Name"))
        if not key:
            continue
        items[key] = StatRecord(
            type=coerce_int(tree.get("_type")),
            note=collapse_text(tree.get("_name")),
        )
    elapsed = round(time.time() - started, 1)
    summary = summarize(items, elapsed)
    reporter.info(
        f"stat assets: {summary['assets']} assets, {summary['with_note']} with notes, {elapsed}s"
    )
    if session.warnings > warnings:
        reporter.warn(f"stat assets: {session.warnings - warnings} read warnings")
    return dict(sorted(items.items())), summary


def summarize(items: dict[str, StatRecord], elapsed: float) -> dict[str, Any]:
    return {
        "assets": len(items),
        "with_note": sum(1 for record in items.values() if record.note),
        "elapsed": round(elapsed, 1),
    }


def document(items: dict[str, StatRecord]) -> StatsDocument:
    return StatsDocument(schema=source_version("stats"), items=items)
