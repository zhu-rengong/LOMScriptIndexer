from pathlib import Path

from cyclopts import App

from ..console import Reporter
from ..paths import CONTRACT_TS_PATH, SCHEMA_PATH
from ..schema.export import write_constants, write_schema
from .common import run_app

app = App(name="scriptindexer-schema", help="Export the data contract for the web client")


@app.default
def main(schema: Path = SCHEMA_PATH, constants: Path = CONTRACT_TS_PATH) -> None:
    reporter = Reporter()
    size = write_schema(schema)
    write_constants(constants)
    reporter.info(f"{schema} {size} bytes")


def cli() -> None:
    run_app(app)
