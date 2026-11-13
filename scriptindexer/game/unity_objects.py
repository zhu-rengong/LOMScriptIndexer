from collections.abc import Iterable, Mapping, Sequence
from typing import Any


def coerce_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    try:
        return int(value)
    except TypeError, ValueError:
        return default


def collapse_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.replace("\r\n", "\n").replace("\r", "\n").split())


def multiline_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()


def object_name(obj: Any, fallback: str = "") -> str:
    if obj is None:
        return fallback
    try:
        value = obj.peek_name()
    except Exception:
        return fallback
    text = str(value or "").strip()
    return text or fallback


def typetree_or_none(obj: Any) -> dict[str, Any] | None:
    if obj is None:
        return None
    try:
        tree = obj.read_typetree()
    except Exception:
        return None
    return tree if isinstance(tree, dict) else None


def valid_path_ref(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return value if coerce_int(value.get("m_PathID")) else None


def as_ref_dict(ref: Any) -> dict[str, Any] | None:
    if isinstance(ref, dict):
        return ref
    convert = getattr(ref, "as_dict", None)
    if callable(convert):
        value = convert()
        return value if isinstance(value, dict) else None
    file_id = getattr(ref, "m_FileID", None)
    path_id = getattr(ref, "m_PathID", None)
    if file_id is None and path_id is None:
        return None
    return {"m_FileID": file_id, "m_PathID": path_id}


def count_by_reason(items: Iterable[Mapping[str, Any]], key: str = "reason") -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in items:
        reason = str(item.get(key) or "?")
        counts[reason] = counts.get(reason, 0) + 1
    return counts


def absent_fields(tree: Mapping[str, Any] | None, fields: Sequence[str]) -> list[str]:
    if not isinstance(tree, Mapping):
        return list(fields)
    return [name for name in fields if name not in tree]
