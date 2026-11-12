from pathlib import Path
from typing import Any

from ..console import Reporter
from .assets import AssetSession
from .unity_fields import LORE_CLASS, LORE_FIELDS
from .unity_objects import absent_fields, count_by_reason, multiline_text

GAP_NOT_FOUND = "not_found"
GAP_EMPTY_TEXT = "empty_text"
GAP_PARSE_ERROR = "parse_error"


def probe_legend_texts(session: AssetSession, wanted_keys: set[str],
                       reporter: Reporter) -> tuple[dict[str, str], list[dict[str, str]]]:
    if not wanted_keys:
        return {}, []
    if session.generator is None:
        raise RuntimeError("TypeTreeGeneratorAPI is not installed")
    items: dict[str, str] = {}
    seen: set[str] = set()
    failed: set[str] = set()
    by_file: dict[Path, list[Any]] = {}
    for path, obj in session.iter_type("MonoBehaviour"):
        name = session.object_name(obj)
        if not name or name not in wanted_keys:
            continue
        if session.monobehaviour_class(path, obj) != LORE_CLASS:
            continue
        by_file.setdefault(path, []).append(obj)
    for path, objects in sorted(by_file.items(), key=lambda item: str(item[0])):
        hits = 0
        for obj in objects:
            name = session.object_name(obj)
            seen.add(name)
            tree = session.typetree(path, obj)
            if not tree:
                failed.add(name)
                continue
            missing = absent_fields(tree, LORE_FIELDS)
            if missing:
                session.warn_once(
                    ("fields", "LegendInfo", *missing),
                    f"LegendInfo is missing {', '.join(missing)};"
                    " lore texts may be incomplete")
            text = multiline_text(tree.get("_text"))
            if not text:
                continue
            if len(text) > len(items.get(name, "")):
                items[name] = text
                hits += 1
        reporter.info(f"{path.name}: {hits} lore texts ({len(items)} total)")
    gaps: list[dict[str, str]] = []
    for key in sorted(wanted_keys):
        if key in items:
            continue
        if key in failed:
            reason = GAP_PARSE_ERROR
        elif key in seen:
            reason = GAP_EMPTY_TEXT
        else:
            reason = GAP_NOT_FOUND
        gaps.append({"key": key, "reason": reason})
    return dict(sorted(items.items())), gaps


def summarize(wanted_keys: set[str], resolved_texts: dict[str, str],
              gaps: list[dict[str, str]], elapsed: float) -> dict[str, Any]:
    return {
        "wanted": len(wanted_keys),
        "resolved": len(resolved_texts),
        "unresolved": max(len(wanted_keys) - len(resolved_texts), 0),
        "by_reason": count_by_reason(gaps),
        "elapsed": round(elapsed, 1),
    }
