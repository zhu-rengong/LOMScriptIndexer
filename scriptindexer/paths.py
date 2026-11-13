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
MISSIONS_PATH = DATA_DIR / "missions.json"
REPORT_PATH = DATA_DIR / "report.json"
FRAMING_PATH = DATA_DIR / "portrait-framing.json"

SITE_DIR = ROOT / "docs"
SITE_DATA_DIR = SITE_DIR / "data"

WEB_DIR = ROOT / "web"
SCHEMA_PATH = WEB_DIR / "schema.json"
CONTRACT_TS_PATH = WEB_DIR / "src" / "types" / "contract.ts"

ANALYSIS_CACHE_PATH = CACHE_DIR / "analysis.msgpack.gz"
PORTRAIT_CACHE_PATH = CACHE_DIR / "portrait-bundles.msgpack.gz"
PORTRAIT_PREVIEW_DIR = CACHE_DIR / "portrait-previews"
PORTRAIT_CROP_DIR = CACHE_DIR / "portrait-avatars"
PORTRAIT_CROP_INDEX_PATH = PORTRAIT_CROP_DIR / "index.msgpack.gz"
