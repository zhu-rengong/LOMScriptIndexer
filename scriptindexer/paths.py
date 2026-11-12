from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = ROOT / "data"
LUA_DIR = DATA_DIR / "lua"
LOCALE_DIR = DATA_DIR / "locale"
CACHE_DIR = DATA_DIR / "cache"

MANIFEST_PATH = DATA_DIR / "manifest.json"
CHECKPOINTS_PATH = DATA_DIR / "checkpoints.json"
ENTRIES_PATH = DATA_DIR / "entries.json"
LORE_PATH = DATA_DIR / "lore.json"
STATS_PATH = DATA_DIR / "stats.json"
BATTLES_PATH = DATA_DIR / "battles.json"
REPORT_PATH = DATA_DIR / "report.json"
FRAMING_PATH = DATA_DIR / "portrait-framing.json"

SITE_DIR = ROOT / "docs"
SITE_DATA_DIR = SITE_DIR / "data"

ANALYSIS_CACHE_PATH = CACHE_DIR / "analysis.pkl.gz"
PORTRAIT_PREVIEW_DIR = CACHE_DIR / "portrait-previews"
CHECKPOINT_CACHE_PATH = CACHE_DIR / "checkpoints.json"
ENTRY_CACHE_PATH = CACHE_DIR / "entries.json"
LORE_CACHE_PATH = CACHE_DIR / "lore.json"
STATS_CACHE_PATH = CACHE_DIR / "stats.json"
BATTLES_CACHE_PATH = CACHE_DIR / "battles.json"
