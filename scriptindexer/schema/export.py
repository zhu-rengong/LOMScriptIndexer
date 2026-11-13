import json
from pathlib import Path

import msgspec
from cyclopts import App

from ..paths import CONTRACT_TS_PATH, SCHEMA_PATH
from .base import schema_digest
from .index import Contract

app = App(name="scriptindexer-schema", help="Export the data contract for the web client")


def contract_schema() -> dict:
    payload: dict = msgspec.json.schema(Contract)
    payload["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    payload["title"] = "ScriptIndexerData"
    return payload


def write_schema(path: Path = SCHEMA_PATH) -> int:
    text = json.dumps(contract_schema(), ensure_ascii=False, indent=2)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")
    return len(text.encode("utf-8"))


def write_constants(path: Path = CONTRACT_TS_PATH) -> int:
    text = f"export const DATA_SCHEMA = {json.dumps(schema_digest(Contract))};\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


@app.default
def main(schema: Path = SCHEMA_PATH, constants: Path = CONTRACT_TS_PATH) -> None:
    size = write_schema(schema)
    write_constants(constants)
    print(f"{schema} {size} bytes")


def cli() -> None:
    app()
