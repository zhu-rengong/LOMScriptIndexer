import argparse
from pathlib import Path

from ..console import Reporter
from ..game.layout import GAME_ENV, discover, game_root
from ..game.locale_tables import character_labels
from ..game.portraits import export_portraits
from ..languages import DEFAULT_LANG
from .common import EXIT_DATA, EXIT_OK


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export character portrait avatars as WebP images (read only)")
    parser.add_argument("--game", default=None,
                        help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--lang", default=DEFAULT_LANG,
                        help="language used for portrait preview labels")
    parser.add_argument("--force", action="store_true",
                        help="ignore the manifest cache and export again")
    args = parser.parse_args(argv)

    reporter = Reporter()
    root = Path(args.game).expanduser() if args.game else game_root()
    layout = discover(root)
    if layout is None:
        reporter.error("game directory not found")
        return EXIT_DATA
    manifest = export_portraits(layout, reporter, force=args.force,
                                labels=character_labels(args.lang))
    reporter.info(f"portraits: {len(manifest.get('characters', {}))} characters ready")
    return EXIT_OK
