from dataclasses import dataclass
from pathlib import Path
from typing import Any

import msgspec

from ..jsonio import atomic_write_bytes
from ..paths import (
    BATTLES_PATH,
    CACHE_DIR,
    CHECKPOINTS_PATH,
    ENTRIES_PATH,
    LORE_PATH,
    MISSIONS_PATH,
    SITE_DATA_DIR,
    STATS_PATH,
)
from .base import encode, schema_digest
from .checkpoints import CheckpointDocument
from .extras import (
    BattleDocument,
    EntriesDocument,
    FlagFactsPayload,
    LoreDocument,
    StatsDocument,
    VarReadsPayload,
)
from .graph import GraphPayload
from .index import DataIndex
from .missions import MissionDocument
from .text import TextHeadPayload, TextShardPayload, WordCountPayload


@dataclass(frozen=True)
class Source:
    name: str
    model: type
    path: Path

    @property
    def version(self) -> str:
        return schema_digest(self.model)

    @property
    def cache(self) -> Path:
        return CACHE_DIR / f"{self.name}.msgpack.gz"


@dataclass(frozen=True)
class Artifact:
    name: str
    model: type
    url: str

    @property
    def version(self) -> str:
        return schema_digest(self.model)

    def path(self, **fields: str) -> Path:
        return SITE_DATA_DIR / self.url.format(**fields).removeprefix("data/")

    def url_for(self, **fields: str) -> str:
        return self.url.format(**fields)


SOURCES: dict[str, Source] = {
    "checkpoints": Source("checkpoints", CheckpointDocument, CHECKPOINTS_PATH),
    "entries": Source("entries", EntriesDocument, ENTRIES_PATH),
    "lore": Source("lore", LoreDocument, LORE_PATH),
    "stats": Source("stats", StatsDocument, STATS_PATH),
    "battles": Source("battles", BattleDocument, BATTLES_PATH),
    "missions": Source("missions", MissionDocument, MISSIONS_PATH),
}

ARTIFACTS: dict[str, Artifact] = {
    "index": Artifact("index", DataIndex, "data/index.json"),
    "graph": Artifact("graph", GraphPayload, "data/graph.json"),
    "textHead": Artifact("textHead", TextHeadPayload, "data/text-{lang}-head.json"),
    "textShard": Artifact("textShard", TextShardPayload, "data/text-{lang}-{key}.json"),
    "wordcount": Artifact("wordcount", WordCountPayload, "data/wordcount.json"),
    "missions": Artifact("missions", MissionDocument, "data/missions.json"),
    "checkpoints": Artifact("checkpoints", CheckpointDocument, "data/checkpoints-{index}.json"),
    "varReads": Artifact("varReads", VarReadsPayload, "data/var-reads.json"),
    "flagFacts": Artifact("flagFacts", FlagFactsPayload, "data/flag-facts.json"),
}


def version_of(name: str) -> str:
    artifact = ARTIFACTS.get(name)
    return artifact.version if artifact is not None else ""


def source_version(name: str) -> str:
    source = SOURCES.get(name)
    return source.version if source is not None else ""


def load_source(name: str) -> Any | None:
    source = SOURCES[name]
    try:
        raw = source.path.read_bytes()
    except OSError:
        return None
    try:
        document = msgspec.json.decode(raw, type=source.model)
    except msgspec.DecodeError:
        return None
    if getattr(document, "schema", "") != source.version:
        return None
    return document


def save_source(name: str, payload: Any) -> int:
    source = SOURCES[name]
    return atomic_write_bytes(source.path, encode(payload) + b"\n")


def write_artifact(name: str, payload: Any, **fields: str) -> tuple[str, int]:
    artifact = ARTIFACTS[name]
    target = artifact.path(**fields)
    size = atomic_write_bytes(target, encode(payload) + b"\n")
    return target.name, size


def artifact_paths(langs: list[str], shard_keys: list[str], checkpoint_shards: int) -> set[str]:
    names = {
        ARTIFACTS["index"].path().name,
        ARTIFACTS["graph"].path().name,
        ARTIFACTS["wordcount"].path().name,
        ARTIFACTS["missions"].path().name,
        ARTIFACTS["varReads"].path().name,
        ARTIFACTS["flagFacts"].path().name,
    }
    for lang in langs:
        names.add(ARTIFACTS["textHead"].path(lang=lang).name)
        for key in shard_keys:
            names.add(ARTIFACTS["textShard"].path(lang=lang, key=key).name)
    for index in range(checkpoint_shards):
        names.add(ARTIFACTS["checkpoints"].path(index=str(index)).name)
    return names
