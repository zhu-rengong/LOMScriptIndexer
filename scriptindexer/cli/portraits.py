from pathlib import Path

from cyclopts import App

from ..console import Reporter
from ..errors import UsageError
from ..game.layout import discover, game_root
from ..game.locale_tables import character_labels
from ..game.portraits import export_portraits
from ..languages import DEFAULT_LANG
from .common import run_app

app = App(
    name="scriptindexer-portraits",
    help="Export character portrait avatars as paged WebP atlases (read only)",
)


@app.default
def main(
    game: Path | None = None, lang: str = DEFAULT_LANG, *, force: bool = False, jobs: int = 0
) -> None:
    reporter = Reporter()
    root = game.expanduser() if game is not None else game_root()
    layout = discover(root)
    if layout is None:
        raise UsageError("game directory not found")
    manifest = export_portraits(
        layout, reporter, force=force, labels=character_labels(lang), jobs=jobs
    )
    reporter.info(f"portraits: {len(manifest.get('characters', {}))} characters ready")


def cli() -> None:
    run_app(app)
