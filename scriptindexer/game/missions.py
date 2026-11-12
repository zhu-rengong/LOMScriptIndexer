import time
from collections.abc import Mapping
from typing import Any

from ..console import Reporter
from .assets import AssetSession
from .unity_fields import (
    MISSION_CLASS,
    MISSION_CLASSES,
    MISSION_DATA_FIELDS,
    MISSION_MANAGER_CLASS,
    SUB_MISSIONS_CLASS,
)
from .unity_objects import absent_fields, collapse_text

RecordKey = tuple[str, int]


def _record_key(path: Any, obj: Any) -> RecordKey:
    return str(path), int(getattr(obj, "path_id", 0) or 0)


def _resolve(session: AssetSession, path: Any, ref: Any) -> tuple[Any, Any] | None:
    try:
        return session.resolve(path, ref)
    except Exception:
        return None


def _state_record(tree: Mapping[str, Any]) -> tuple[str, dict[str, str]] | None:
    key = collapse_text(tree.get("_key")) or collapse_text(tree.get("m_Name"))
    if not key:
        return None
    started = collapse_text(tree.get("_startScript"))
    return key, {
        "start": started.removesuffix(".lua"),
        "next": collapse_text(tree.get("_nextStateName")),
    }


def _mission_record(session: AssetSession, path: Any, tree: Mapping[str, Any],
                    main: bool) -> tuple[str, dict[str, Any], int]:
    name = collapse_text(tree.get("_name")) or collapse_text(tree.get("m_Name"))
    if not name:
        return "", {}, 0
    missing = absent_fields(tree, MISSION_DATA_FIELDS)
    if missing:
        session.warn_once(
            ("fields", MISSION_CLASS, *missing),
            f"{MISSION_CLASS} is missing {', '.join(missing)}; mission data may be incomplete")
    states: dict[str, dict[str, str]] = {}
    unresolved = 0
    for ref in tree.get("_missions") or []:
        hit = _resolve(session, path, ref)
        state_tree = session.typetree(hit[1].path, hit[0]) if hit is not None else None
        if not isinstance(state_tree, Mapping):
            unresolved += 1
            continue
        parsed = _state_record(state_tree)
        if parsed is None:
            unresolved += 1
            continue
        states[parsed[0]] = parsed[1]
    record = {
        "desc": collapse_text(tree.get("_desc")),
        "main": main,
        "init": collapse_text(tree.get("_initKey")),
        "states": states,
    }
    return name, record, unresolved


def extract(session: AssetSession, reporter: Reporter
            ) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    started = time.time()
    warnings = session.warnings
    records: dict[RecordKey, tuple[Any, dict[str, Any]]] = {}
    manager: tuple[Any, dict[str, Any]] | None = None
    subs: tuple[Any, dict[str, Any]] | None = None
    for path, obj, cls in session.iter_class(MISSION_CLASSES):
        tree = session.typetree(path, obj)
        if not isinstance(tree, dict):
            continue
        if cls == MISSION_CLASS:
            records[_record_key(path, obj)] = (path, tree)
        elif cls == MISSION_MANAGER_CLASS:
            if manager is not None:
                session.warn_once(
                    ("manager", "multiple"),
                    f"multiple {MISSION_MANAGER_CLASS} assets found; using the first")
                continue
            manager = (path, tree)
        elif cls == SUB_MISSIONS_CLASS:
            if subs is not None:
                session.warn_once(
                    ("subs", "multiple"),
                    f"multiple {SUB_MISSIONS_CLASS} assets found; using the first")
                continue
            subs = (path, tree)

    unresolved = 0
    main_keys: set[RecordKey] = set()
    if manager is not None:
        main_ref = manager[1].get("_main")
        hit = _resolve(session, manager[0], main_ref)
        if hit is not None:
            main_keys.add(_record_key(hit[1].path, hit[0]))
        elif main_ref:
            unresolved += 1

    sub_keys: set[RecordKey] = set()
    if subs is not None:
        for ref in subs[1].get("_list") or []:
            hit = _resolve(session, subs[0], ref)
            if hit is None:
                unresolved += 1
                continue
            sub_keys.add(_record_key(hit[1].path, hit[0]))

    items: dict[str, dict[str, Any]] = {}
    state_owners: dict[str, str] = {}
    for key, (path, tree) in records.items():
        name, record, failed = _mission_record(session, path, tree, key in main_keys)
        unresolved += failed
        if not name:
            continue
        if name in items:
            session.warn_once(
                ("duplicate", name),
                f"duplicate {MISSION_CLASS} name {name}; keeping the first")
            continue
        if not record["main"] and name.lower() == "main":
            record["main"] = True
        for state_key in record["states"]:
            owner = state_owners.setdefault(state_key, name)
            if owner != name:
                session.warn_once(
                    ("state", state_key),
                    f"mission state {state_key} is defined by both {owner} and {name}")
        items[name] = record
    sub_count = len(sub_keys)

    items = dict(sorted(items.items()))
    summary = summarize(items, time.time() - started)
    summary["unresolved"] = unresolved
    summary["sub_missions"] = sub_count
    reporter.info(
        f"mission assets: {summary['missions']} missions, {summary['states']} states"
        f" ({summary['with_start']} with start scripts, {summary['with_note']} with notes),"
        f" {unresolved} unresolved, {summary['elapsed']}s")
    if session.warnings > warnings:
        reporter.warn(f"mission assets: {session.warnings - warnings} read warnings")
    return items, summary


def summarize(items: dict[str, dict[str, Any]], elapsed: float) -> dict[str, Any]:
    states = [
        state
        for record in items.values()
        for state in (record.get("states") or {}).values()
    ]
    return {
        "missions": len(items),
        "main_missions": sum(1 for record in items.values() if record.get("main")),
        "states": len(states),
        "with_start": sum(1 for state in states if state.get("start")),
        "with_note": sum(1 for record in items.values() if record.get("desc")),
        "elapsed": round(elapsed, 1),
    }
