import re
import time
from pathlib import Path
from typing import Any

from ..console import Reporter
from ..jsonio import read_json
from ..languages import SUPPORTED_LANGS
from ..paths import LOCALE_DIR
from .assets import AssetSession

_LOCALE_LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)/([^\r\n=]{1,160}?) = (.*)$")

TRADITIONAL_MARKERS = "這幾個們說為與後裡臺灣點麼樣還過對發現實當經開關無麼"
SIMPLIFIED_MARKERS = "这几个们说为与后里台湾点么样还过对发现实当经开关无么"
HANGUL_RANGE = ("\uac00", "\ud7a3")
HAN_RANGE = ("\u4e00", "\u9fff")
LOCALE_MIN_MATCHES = 8


def lang_from_filename(name: str) -> str | None:
    lower = (name or "").strip().lower()
    for lang in SUPPORTED_LANGS:
        if not lower.endswith(lang):
            continue
        head = lower[: -len(lang)]
        if head.endswith("_") or head.endswith("-"):
            return lang
    return None


def _count_range(text: str, lo: str, hi: str) -> int:
    return sum(1 for char in text if lo <= char <= hi)


def _count_chars(text: str, charset: str) -> int:
    return sum(1 for char in text if char in charset)


def detect_language(text: str) -> str | None:
    hangul = _count_range(text, *HANGUL_RANGE)
    han = _count_range(text, *HAN_RANGE)
    if hangul > 0 and hangul >= han * 0.2:
        return "kr"
    if han == 0:
        return None
    traditional = _count_chars(text, TRADITIONAL_MARKERS)
    simplified = _count_chars(text, SIMPLIFIED_MARKERS)
    if traditional > simplified:
        return "zh-tw"
    if simplified > traditional:
        return "zh-cn"
    return None


def parse_locale_text(text: str) -> tuple[dict[str, dict[str, str]], int]:
    table: dict[str, dict[str, str]] = {}
    line_count = 0
    for raw_line in text.splitlines():
        if not raw_line.strip() or raw_line.lstrip().startswith("//"):
            continue
        match = _LOCALE_LINE.match(raw_line)
        if not match:
            continue
        namespace, key, value = match.group(1), match.group(2), match.group(3)
        table.setdefault(namespace, {})[key] = value.replace("\\n", "\n")
        line_count += 1
    return table, line_count


def character_labels(lang: str) -> dict[str, str]:
    payload = read_json(LOCALE_DIR / f"{lang}.json")
    table = payload.get("Character") if isinstance(payload, dict) else None
    return table if isinstance(table, dict) else {}


def merge_tables_into(target: dict[str, dict[str, str]],
                      incoming: dict[str, dict[str, str]]) -> int:
    added = 0
    for namespace, entries in incoming.items():
        bucket = target.setdefault(namespace, {})
        for key, value in entries.items():
            if key not in bucket:
                bucket[key] = value
                added += 1
    return added


def _locale_assets(session: AssetSession) -> list[tuple[Any, str | None]]:
    assets = list(session.iter_type("TextAsset"))
    suffixed: list[tuple[Any, str]] = []
    locale_files: set[Path] = set()
    for path, obj in assets:
        lang = lang_from_filename(session.object_name(obj))
        if lang is not None and lang in SUPPORTED_LANGS:
            suffixed.append((obj, lang))
            locale_files.add(path)
    handled = {id(obj) for obj, _lang in suffixed}
    candidates: list[tuple[Any, str | None]] = [(obj, lang) for obj, lang in suffixed]
    for path, obj in assets:
        if path in locale_files and id(obj) not in handled:
            candidates.append((obj, None))
    return candidates


def extract_locales(session: AssetSession, langs: tuple[str, ...],
                    reporter: Reporter
                    ) -> tuple[dict[str, dict[str, dict[str, str]]], dict[str, Any]]:
    started = time.time()
    tables: dict[str, dict[str, dict[str, str]]] = {lang: {} for lang in langs}
    stats: dict[str, Any] = {"source_files": 0, "lines": 0, "skipped": 0, "skipped_lang": 0,
                             "unknown_lang": 0, "detected": 0}
    for obj, lang in _locale_assets(session):
        text = session.read_text(obj)
        if " = " not in text:
            stats["skipped"] += 1
            continue
        table, line_count = parse_locale_text(text)
        if line_count < LOCALE_MIN_MATCHES:
            stats["skipped"] += 1
            continue
        if lang is None:
            lang = detect_language(text)
            stats["detected"] += 1
        if lang is None:
            stats["unknown_lang"] += 1
            continue
        if lang not in tables:
            stats["skipped_lang"] += 1
            continue
        stats["source_files"] += 1
        stats["lines"] += line_count
        merge_tables_into(tables[lang], table)
    reporter.info(
        f"{stats['source_files']} locale files, {stats['lines']} lines"
        f" ({stats['detected']} detected, {stats['unknown_lang']} unknown,"
        f" {stats['skipped_lang']} other languages, {stats['skipped']} skipped),"
        f" {time.time() - started:.1f}s"
    )
    return tables, stats
