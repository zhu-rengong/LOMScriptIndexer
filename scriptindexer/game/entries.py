import time
from typing import Any

from ..console import Reporter
from ..schema import EntriesDocument, EntryStats, source_version
from .assets import AssetSession, FileScope
from .unity_fields import POSITION_CLASS
from .unity_objects import absent_fields

PROGRESS_EVERY = 200


def match_script_id(value: Any, known_ids: set[str], folded: dict[str, str]) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""
    if text in known_ids:
        return text
    return folded.get(text.lower(), "")


def _referred_typetree(scope: FileScope, ref: Any) -> dict[str, Any] | None:
    obj, target_scope = scope.resolve_or_empty(ref)
    if obj is None:
        return None
    return target_scope.session.typetree(target_scope.path, obj)


def _position_script_targets(
    scope: FileScope, tree: dict[str, Any], known_ids: set[str], folded: dict[str, str]
) -> list[str]:
    prefix = (tree.get("_scriptPrefix") or "").strip()
    if not prefix:
        return []
    found: set[str] = set()
    for ref in tree.get("_list") or []:
        event = _referred_typetree(scope, ref)
        if not event:
            continue
        mapping = _referred_typetree(scope, event.get("_config"))
        if not mapping:
            continue
        value = mapping.get("Value")
        if value is None:
            continue
        target = match_script_id(f"{prefix}_{str(value).strip()}", known_ids, folded)
        if target:
            found.add(target)
    return sorted(found)


def probe_positions(session: AssetSession, ids: set[str], reporter: Reporter) -> EntriesDocument:
    started = time.time()
    warnings = session.warnings
    known_ids = set(ids)
    folded = {sid.lower(): sid for sid in sorted(known_ids)}
    stats = EntryStats()
    document = EntriesDocument(
        schema=source_version("entries"),
        fingerprint=session.layout.fingerprint(),
        generated=time.strftime("%Y-%m-%d %H:%M:%S"),
        stats=stats,
    )

    if session.generator is None:
        stats.reason = "TypeTreeGeneratorAPI is not installed or its .NET runtime is unavailable"
        reporter.warn(stats.reason)
        return document

    position_targets: dict[str, list[str]] = {}
    unresolved: list[str] = []
    classes: dict[str, int] = {}
    scanned = 0

    for path, obj, cls in session.iter_class({POSITION_CLASS}):
        scanned += 1
        if scanned % PROGRESS_EVERY == 0:
            reporter.info(f"scanned {scanned} position objects...")
        classes[cls] = classes.get(cls, 0) + 1
        tree = session.typetree(path, obj)
        if not tree:
            continue
        missing = absent_fields(tree, ("_scriptPrefix", "_list"))
        if missing:
            session.warn_once(
                ("fields", cls, *missing),
                f"{cls} is missing {', '.join(missing)}; position probes may be incomplete",
            )
        position_name = (tree.get("m_Name") or "").strip()
        if not position_name:
            continue
        targets = _position_script_targets(session.file_scope(path), tree, known_ids, folded)
        position_targets[position_name] = targets
        if not targets:
            unresolved.append(position_name)

    document.position_targets = {name: position_targets[name] for name in sorted(position_targets)}
    document.unresolved = sorted(unresolved)[:60]
    document.stats = EntryStats(
        ok=True,
        reason="",
        classes=classes,
        positions=len(position_targets),
        position_targets=sum(len(targets) for targets in position_targets.values()),
        positions_unresolved=len(unresolved),
        warnings=session.warnings - warnings,
        elapsed=round(time.time() - started, 1),
    )
    reporter.info(
        f"system positions: {len(position_targets)} names"
        f" -> {document.stats.position_targets} targets, {document.stats.elapsed}s"
    )
    return document


def summarize(document: EntriesDocument | None) -> dict[str, Any]:
    if document is None:
        return {
            "ok": False,
            "reason": "asset probe not run (missing data/entries.json)",
            "version": None,
            "classes": {},
            "positions": 0,
            "position_targets": 0,
            "positions_unresolved": 0,
            "elapsed": 0.0,
        }
    stats = document.stats
    return {
        "ok": stats.ok,
        "reason": stats.reason,
        "version": document.schema,
        "classes": stats.classes,
        "positions": stats.positions,
        "position_targets": stats.position_targets,
        "positions_unresolved": stats.positions_unresolved,
        "elapsed": stats.elapsed,
    }
