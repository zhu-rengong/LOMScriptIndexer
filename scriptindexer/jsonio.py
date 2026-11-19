import contextlib
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

import msgspec

ENCODER = msgspec.json.Encoder()


def encode(payload: Any) -> bytes:
    return ENCODER.encode(payload)


def decode[T](raw: bytes, model: type[T]) -> T:
    return msgspec.json.decode(raw, type=model)


def format_json(raw: bytes, indent: int) -> bytes:
    return msgspec.json.format(raw, indent=indent)


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


def write_bytes(path: Path, payload: bytes) -> int:
    def write(temp: Path) -> None:
        temp.write_bytes(payload)

    _atomic(path, write)
    return len(payload)


def write_text(path: Path, text: str) -> int:
    def write(temp: Path) -> None:
        with open(temp, "w", encoding="utf-8", newline="\n") as fp:
            fp.write(text)

    _atomic(path, write)
    return len(text.encode("utf-8"))


def write_json(path: Path, payload: Any, indent: int | None = None) -> int:
    raw = encode(payload)
    if indent is not None:
        raw = format_json(raw, indent)
    return write_bytes(path, raw + b"\n")


def read_json[T](path: Path, model: type[T]) -> T | None:
    try:
        raw = Path(path).read_bytes()
    except OSError:
        return None
    try:
        return decode(raw, model)
    except msgspec.DecodeError:
        return None


def read_payload(path: Path) -> Any:
    try:
        raw = Path(path).read_bytes()
    except OSError:
        return None
    try:
        return msgspec.json.decode(raw)
    except msgspec.DecodeError:
        return None
