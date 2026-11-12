import argparse
from pathlib import Path

from ..console import Reporter
from ..extract import STATUS_DATA_ERROR, STATUS_USAGE, ExtractRequest, run_extract
from ..game.layout import GAME_ENV
from ..languages import LOCALE_LANGS
from .common import EXIT_DATA, EXIT_OK, EXIT_USAGE, split_langs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract script Lua files and locale tables from the game assets (read only)")
    parser.add_argument("--game", default=None, help=f"game root directory (defaults to ${GAME_ENV})")
    parser.add_argument("--langs", default=",".join(LOCALE_LANGS),
                        help="locale tables to export, comma separated")
    parser.add_argument("--force", action="store_true", help="ignore caches and extract again")
    parser.add_argument("--checkpoints", dest="with_checkpoints", action="store_true",
                        default=True)
    parser.add_argument("--no-checkpoints", dest="with_checkpoints", action="store_false")
    parser.add_argument("--entries", dest="with_entries", action="store_true", default=True,
                        help="also probe system entries (default on)")
    parser.add_argument("--no-entries", dest="with_entries", action="store_false",
                        help="skip the system entry probe")
    parser.add_argument("--lore", dest="with_lore", action="store_true", default=True,
                        help="also extract StoryData lore fallback texts (default on)")
    parser.add_argument("--no-lore", dest="with_lore", action="store_false",
                        help="skip the StoryData lore fallback extraction")
    parser.add_argument("--stats", dest="with_stats", action="store_true", default=True,
                        help="also extract stat asset names and notes (default on)")
    parser.add_argument("--no-stats", dest="with_stats", action="store_false",
                        help="skip the stat asset extraction")
    parser.add_argument("--battles", dest="with_battles", action="store_true", default=True,
                        help="also extract battle and combat levels (default on)")
    parser.add_argument("--no-battles", dest="with_battles", action="store_false",
                        help="skip the battle level extraction")
    parser.add_argument("--portraits", dest="with_portraits", action="store_true", default=True,
                        help="also export character portrait avatars (default on)")
    parser.add_argument("--no-portraits", dest="with_portraits", action="store_false",
                        help="skip the character portrait export")
    args = parser.parse_args(argv)

    request = ExtractRequest(
        game=Path(args.game).expanduser() if args.game else None,
        langs=split_langs(args.langs),
        force=args.force,
        with_checkpoints=args.with_checkpoints,
        with_entries=args.with_entries,
        with_lore=args.with_lore,
        with_stats=args.with_stats,
        with_battles=args.with_battles,
        with_portraits=args.with_portraits,
    )
    result = run_extract(request, Reporter())
    if result.status == STATUS_USAGE:
        return EXIT_USAGE
    if result.status == STATUS_DATA_ERROR:
        return EXIT_DATA
    return EXIT_OK
