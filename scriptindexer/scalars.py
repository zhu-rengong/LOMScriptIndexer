import math
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


def number_text(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(int(value)) if value.is_integer() else f"{value:g}"
    if isinstance(value, str):
        return value.strip()
    try:
        number = float(value)
    except TypeError, ValueError:
        return ""
    if not math.isfinite(number):
        return ""
    return str(int(number)) if number.is_integer() else f"{number:g}"


def normalize_newlines(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return value.replace("\r\n", "\n").replace("\r", "\n")
