import hashlib
import json
from functools import cache
from typing import Any

import msgspec

ENCODER = msgspec.json.Encoder()


class Wire(msgspec.Struct, rename="camel", omit_defaults=True):
    pass


@cache
def schema_digest(model: type[Any]) -> str:
    payload: dict[str, Any] = msgspec.json.schema(model)
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def encode(payload: Any) -> bytes:
    return ENCODER.encode(payload)


def decode(payload: bytes, model: type) -> Any:
    return msgspec.json.decode(payload, type=model)


def digest_of(model: type[Any]) -> str:
    return schema_digest(model)
