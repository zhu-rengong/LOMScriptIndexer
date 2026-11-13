import contextlib
import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

_COMPACT = {"ensure_ascii": False, "separators": (",", ":")}


def dump_json(payload: Any) -> str:
    return json.dumps(payload, **_COMPACT)


def _atomic(path: Path, write: Callable[[Path], None]) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_name = tempfile.mkstemp(
        dir=str(target.parent), prefix=f".{target.name}.", suffix=".tmp"
    )
    os.close(handle)
    try:
        write(Path(temp_name))
        os.replace(temp_name, target)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temp_name)
        raise


def atomic_write_text(path: Path, text: str) -> int:
    def write(temp: Path) -> None:
        with open(temp, "w", encoding="utf-8", newline="\n") as fp:
            fp.write(text)

    _atomic(path, write)
    return len(text.encode("utf-8"))


def atomic_write_bytes(path: Path, payload: bytes) -> int:
    def write(temp: Path) -> None:
        temp.write_bytes(payload)

    _atomic(path, write)
    return len(payload)


def read_json(path: Path) -> Any | None:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError, ValueError:
        return None


def write_json(path: Path, payload: Any, indent: int | None = 2) -> int:
    text = json.dumps(
        payload, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":")
    )
    return atomic_write_text(path, text + "\n")
