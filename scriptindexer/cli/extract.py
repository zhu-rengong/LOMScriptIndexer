from pathlib import Path

from cyclopts import App

from ..console import Reporter
from ..extract import ExtractRequest, run_extract
from ..languages import LOCALE_LANGS
from .common import run_app, split_langs

app = App(
    name="scriptindexer-extract",
    help="Extract script Lua files and locale tables from the game assets (read only)",
)


@app.default
def main(
    game: Path | None = None,
    langs: str = ",".join(LOCALE_LANGS),
    *,
    force: bool = False,
    checkpoints: bool = True,
    entries: bool = True,
    lore: bool = True,
    stats: bool = True,
    missions: bool = True,
    battles: bool = True,
    portraits: bool = True,
    jobs: int = 0,
) -> None:
    request = ExtractRequest(
        game=game.expanduser() if game is not None else None,
        langs=split_langs(langs),
        force=force,
        checkpoints=checkpoints,
        entries=entries,
        lore=lore,
        stats=stats,
        missions=missions,
        battles=battles,
        portraits=portraits,
        portrait_jobs=jobs,
    )
    run_extract(request, Reporter())


def cli() -> None:
    run_app(app)
