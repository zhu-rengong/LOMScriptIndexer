from cyclopts import App

from . import build, extract, portraits
from .common import run_app

app = App(name="scriptindexer", help="Legend of Mortal script extraction and site data pipeline")

app.command(extract.app)
app.command(build.app)
app.command(portraits.app)


def main() -> None:
    run_app(app)
