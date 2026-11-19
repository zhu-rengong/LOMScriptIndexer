from pathlib import Path

import msgspec

from ..jsonio import write_json, write_text
from ..paths import CONTRACT_TS_PATH, SCHEMA_PATH
from .base import schema_digest
from .index import Contract


def contract_schema() -> dict[str, object]:
    payload: dict[str, object] = msgspec.json.schema(Contract)
    payload["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    payload["title"] = "ScriptIndexerData"
    return payload


def write_schema(path: Path = SCHEMA_PATH) -> int:
    return write_json(path, contract_schema(), indent=2)


def write_constants(path: Path = CONTRACT_TS_PATH) -> int:
    return write_text(path, f"export const DATA_SCHEMA = {schema_digest(Contract)!r};\n")
