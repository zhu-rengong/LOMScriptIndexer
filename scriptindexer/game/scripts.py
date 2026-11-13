import time
from dataclasses import dataclass, field
from typing import Any

from ..console import Reporter
from .assets import AssetSession

ZH_TW_PREFIX = "story/chinesetraditional/"
ZH_CN_PREFIX = "story/chinesesimplified/"
ORIGIN_TRADITIONAL = "traditional"
ORIGIN_SIMPLIFIED = "simplified"


@dataclass
class ScriptCorpus:
    scripts: dict[str, str] = field(default_factory=dict)
    origin_lang: dict[str, str] = field(default_factory=dict)
    stats: dict[str, Any] = field(default_factory=dict)
    anomalies: dict[str, list[str]] = field(default_factory=dict)


def resource_container_rows(session: AssetSession) -> list[tuple[str, int]]:
    found = session.find_type("ResourceManager")
    if found is None:
        return []
    path, obj = found
    tree = session.typetree(path, obj)
    rows: list[tuple[str, int]] = []
    for item in (tree or {}).get("m_Container") or []:
        try:
            name, info = item
            rows.append((str(name), int(info["m_PathID"])))
        except TypeError, ValueError, KeyError:
            continue
    return rows


def _file_name(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def extract_scripts(session: AssetSession, reporter: Reporter) -> ScriptCorpus:
    started = time.time()
    container_rows = [(name.lower(), path_id) for name, path_id in resource_container_rows(session)]
    reporter.info(f"{len(container_rows)} resource paths")

    traditional: list[tuple[int, str]] = []
    simplified: list[tuple[int, str]] = []
    for name, path_id in container_rows:
        if name.startswith(ZH_TW_PREFIX):
            traditional.append((path_id, _file_name(name)))
        elif name.startswith(ZH_CN_PREFIX):
            simplified.append((path_id, _file_name(name)))

    expected_by_path_id = {path_id: name for path_id, name in traditional}
    expected_by_path_id.update(
        {path_id: name for path_id, name in simplified if path_id not in expected_by_path_id}
    )
    resolved_texts: dict[int, tuple[str, str]] = {}
    for _path, obj in session.iter_type("TextAsset"):
        path_id = int(getattr(obj, "path_id", 0) or 0)
        expected = expected_by_path_id.get(path_id)
        if expected is None:
            continue
        name = session.object_name(obj)
        if name:
            folded = name.lower()
            if folded not in (expected.lower(), f"{expected.lower()}.lua"):
                continue
        if path_id not in resolved_texts:
            text = session.read_text(obj).replace("\r\n", "\n").replace("\r", "\n")
            resolved_texts[path_id] = (name or expected, text)

    corpus = ScriptCorpus()
    missing_names: list[str] = []
    empty_names: list[str] = []

    for path_id, name in traditional:
        if path_id not in resolved_texts:
            missing_names.append(name)
            continue
        text_name, text = resolved_texts[path_id]
        key = (text_name or name).removesuffix(".lua")
        if not text:
            empty_names.append(key)
        corpus.scripts[key] = text
        corpus.origin_lang[key] = ORIGIN_TRADITIONAL

    simplified_only_names: list[str] = []
    for path_id, name in simplified:
        if path_id not in expected_by_path_id or path_id not in resolved_texts:
            continue
        text_name, text = resolved_texts[path_id]
        key = (text_name or name).removesuffix(".lua")
        if not text or corpus.scripts.get(key):
            continue
        corpus.scripts[key] = text
        corpus.origin_lang[key] = ORIGIN_SIMPLIFIED
        simplified_only_names.append(key)
        if key in empty_names:
            empty_names.remove(key)

    corpus.stats = {
        "text_assets": len(resolved_texts),
        "traditional": sum(
            1 for value in corpus.origin_lang.values() if value == ORIGIN_TRADITIONAL
        ),
        "simplified_only": len(simplified_only_names),
    }
    corpus.anomalies = {
        "simplified_only_scripts": simplified_only_names,
        "empty_scripts": empty_names,
        "missing_scripts": missing_names,
    }

    reporter.info(
        f"{len(resolved_texts)} TextAssets -> {len(corpus.scripts)} scripts"
        f" (traditional {corpus.stats['traditional']},"
        f" simplified only {corpus.stats['simplified_only']}),"
        f" {time.time() - started:.1f}s"
    )
    if simplified_only_names:
        reporter.info(
            f"simplified only (unreachable in game): {', '.join(simplified_only_names[:6])}"
        )
    if empty_names:
        reporter.info(f"{len(empty_names)} empty scripts: {', '.join(empty_names[:6])}")
    if missing_names:
        reporter.warn(
            f"{len(missing_names)} paths present but resources missing: {missing_names[:3]}"
        )
    return corpus
