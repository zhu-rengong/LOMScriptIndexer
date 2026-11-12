import time
from collections.abc import Mapping
from typing import Any

from ..console import Reporter
from .assets import AssetSession
from .conditions import condition_node
from .unity_fields import (
    MISSION_CLASS,
    MISSION_CLASSES,
    MISSION_DATA_FIELDS,
    MISSION_MANAGER_CLASS,
    MISSION_STATE_FIELDS,
    PORTRAIT_CODES,
    POSITION_CODES,
    SUB_MISSIONS_CLASS,
)
from .unity_objects import absent_fields, coerce_int, collapse_text

RecordKey = tuple[str, int]


def _record_key(path: Any, obj: Any) -> RecordKey:
    return str(path), int(getattr(obj, "path_id", 0) or 0)


def _resolve(session: AssetSession, path: Any, ref: Any) -> tuple[Any, Any] | None:
    try:
        return session.resolve(path, ref)
    except Exception:
        return None


def _game_time(value: Any) -> dict[str, int] | None:
    if not isinstance(value, Mapping):
        return None
    return {
        "year": coerce_int(value.get("Year")),
        "month": coerce_int(value.get("Month")),
        "stage": coerce_int(value.get("Stage")),
        "day": coerce_int(value.get("DayEnvironment")),
    }


def _time_rule(tree: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "check": bool(coerce_int(tree.get("_dayCheck"))),
        "type": coerce_int(tree.get("_timeCheckType")),
        "specific": _game_time(tree.get("_specificTime")),
        "min": _game_time(tree.get("_minTime")),
        "max": _game_time(tree.get("_maxTime")),
        "period": coerce_int(tree.get("_periodStage")),
    }


def _condition_items(session: AssetSession, path: Any, items: Any
                     ) -> tuple[list[dict[str, Any]], int]:
    scope = session.file_scope(path)
    conditions: list[dict[str, Any]] = []
    gaps = 0
    for item in items or []:
        if not isinstance(item, Mapping):
            gaps += 1
            continue
        if not (item.get("_items") or []):
            continue
        expr = condition_node(dict(item), scope)
        if expr is None:
            gaps += 1
            continue
        conditions.append({"note": collapse_text(item.get("_devNote")), "expr": expr})
    return conditions, gaps


def _dialog_items(tree: Mapping[str, Any], field: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for item in tree.get(field) or []:
        if not isinstance(item, Mapping):
            continue
        key = collapse_text(item.get("_dialog"))
        if not key:
            continue
        portrait = PORTRAIT_CODES.get(coerce_int(item.get("_portrait")), "")
        out.append({"portrait": portrait, "key": key})
    return out


def _flag_changes(session: AssetSession, path: Any, items: Any
                  ) -> tuple[list[dict[str, Any]], int]:
    changes: list[dict[str, Any]] = []
    gaps = 0
    for item in items or []:
        if not isinstance(item, Mapping):
            gaps += 1
            continue
        hit = _resolve(session, path, item.get("_data"))
        flag_tree = session.typetree(hit[1].path, hit[0]) if hit is not None else None
        if not isinstance(flag_tree, Mapping):
            gaps += 1
            continue
        key = collapse_text(flag_tree.get("m_Name")) or session.object_name(hit[0])
        if not key:
            gaps += 1
            continue
        changes.append({
            "key": key,
            "value": coerce_int(item.get("_value")),
            "note": collapse_text(flag_tree.get("_devNote")),
        })
    return changes, gaps


def _state_record(session: AssetSession, path: Any, tree: Mapping[str, Any]
                  ) -> tuple[str, dict[str, Any], int, int]:
    key = collapse_text(tree.get("_key")) or collapse_text(tree.get("m_Name"))
    if not key:
        return "", {}, 0, 0
    missing = absent_fields(tree, MISSION_STATE_FIELDS)
    if missing:
        session.warn_once(
            ("state", "fields", key, *missing),
            f"{MISSION_CLASS} state {key} is missing {', '.join(missing)}")
    conditions, condition_gaps = _condition_items(session, path, tree.get("_conditions"))
    flags_true, gaps_true = _flag_changes(session, path, tree.get("_modifyFlagsWhenTrue"))
    flags_false, gaps_false = _flag_changes(session, path, tree.get("_modifyFlagsWhenFalse"))
    position = coerce_int(tree.get("_position"))
    started = collapse_text(tree.get("_startScript"))
    record = {
        "desc": collapse_text(tree.get("_desc")),
        "active": bool(coerce_int(tree.get("_active"), 1)),
        "position": position,
        "positionCode": POSITION_CODES.get(position, ""),
        "beforeMain": bool(coerce_int(tree.get("_beforeMainMission"))),
        "start": started.removesuffix(".lua"),
        "next": collapse_text(tree.get("_nextStateName")),
        "time": _time_rule(tree),
        "conditions": conditions,
        "startDialogs": _dialog_items(tree, "_startDialogs"),
        "alertDialogs": _dialog_items(tree, "_alertDialogs"),
        "modifyFlagsTrue": flags_true,
        "modifyFlagsFalse": flags_false,
    }
    return key, record, condition_gaps, gaps_true + gaps_false


def _mission_record(session: AssetSession, path: Any, tree: Mapping[str, Any],
                    main: bool) -> tuple[str, dict[str, Any], int, int]:
    name = collapse_text(tree.get("_name")) or collapse_text(tree.get("m_Name"))
    if not name:
        return "", {}, 0, 0
    missing = absent_fields(tree, MISSION_DATA_FIELDS)
    if missing:
        session.warn_once(
            ("fields", MISSION_CLASS, *missing),
            f"{MISSION_CLASS} is missing {', '.join(missing)}; mission data may be incomplete")
    states: dict[str, dict[str, Any]] = {}
    unresolved = 0
    condition_gaps = 0
    for ref in tree.get("_missions") or []:
        hit = _resolve(session, path, ref)
        state_tree = session.typetree(hit[1].path, hit[0]) if hit is not None else None
        if not isinstance(state_tree, Mapping):
            unresolved += 1
            continue
        state_key, state_record, state_gaps, flag_gaps = _state_record(session, path, state_tree)
        condition_gaps += state_gaps
        unresolved += flag_gaps
        if not state_key:
            unresolved += 1
            continue
        if state_key in states:
            session.warn_once(
                ("state", "duplicate", state_key),
                f"duplicate mission state {state_key}; keeping the first")
            continue
        states[state_key] = state_record
    record = {
        "desc": collapse_text(tree.get("_desc")),
        "main": main,
        "init": collapse_text(tree.get("_initKey")),
        "states": states,
    }
    return name, record, unresolved, condition_gaps


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
    condition_gaps = 0
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
        name, record, failed, gaps = _mission_record(session, path, tree, key in main_keys)
        unresolved += failed
        condition_gaps += gaps
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
    summary["condition_gaps"] = condition_gaps
    summary["sub_missions"] = sub_count
    reporter.info(
        f"mission assets: {summary['missions']} missions, {summary['states']} states"
        f" ({summary['with_start']} with start scripts, {summary['with_state_note']} with notes,"
        f" {summary['with_conditions']} with conditions, {summary['conditions']} condition items,"
        f" {summary['with_dialogs']} with dialogs, {summary['with_flags']} with flag changes),"
        f" {condition_gaps} condition gaps, {unresolved} unresolved, {summary['elapsed']}s")
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
        "with_mission_note": sum(1 for record in items.values() if record.get("desc")),
        "with_state_note": sum(1 for state in states if state.get("desc")),
        "with_conditions": sum(1 for state in states if state.get("conditions")),
        "conditions": sum(len(state.get("conditions") or []) for state in states),
        "with_dialogs": sum(
            1 for state in states
            if state.get("startDialogs") or state.get("alertDialogs")),
        "with_flags": sum(
            1 for state in states
            if state.get("modifyFlagsTrue") or state.get("modifyFlagsFalse")),
        "inactive": sum(1 for state in states if not state.get("active")),
        "next_states": sum(1 for state in states if state.get("next")),
        "before_main": sum(1 for state in states if state.get("beforeMain")),
        "with_position": sum(1 for state in states if state.get("positionCode")),
        "elapsed": round(elapsed, 1),
    }
