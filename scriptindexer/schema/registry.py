from dataclasses import dataclass
from pathlib import Path
from typing import Any

import msgspec

from ..jsonio import decode, encode, write_bytes
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
from .base import schema_digest
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
from .index import ArtifactEntry, DataIndex
from .missions import MissionDocument
from .text import TextHeadPayload, TextShardPayload, WordCountPayload


@dataclass(frozen=True)
class Document:
    name: str
    model: type

    @property
    def version(self) -> str:
        return schema_digest(self.model)

    def decode(self, raw: bytes) -> Any | None:
        try:
            payload = decode(raw, self.model)
        except msgspec.DecodeError:
            return None
        return payload if getattr(payload, "schema", "") == self.version else None


@dataclass(frozen=True)
class Source(Document):
    path: Path

    @property
    def cache(self) -> Path:
        return CACHE_DIR / f"{self.name}.msgpack.gz"

    def load(self) -> Any | None:
        try:
            raw = self.path.read_bytes()
        except OSError:
            return None
        return self.decode(raw)

    def save(self, payload: Any) -> int:
        return write_bytes(self.path, encode(payload) + b"\n")


@dataclass(frozen=True)
class Artifact(Document):
    url: str

    def path(self, **fields: str) -> Path:
        return SITE_DATA_DIR / self.url.format(**fields).removeprefix("data/")

    def url_for(self, **fields: str) -> str:
        return self.url.format(**fields)

    def save(self, payload: Any, **fields: str) -> tuple[str, int]:
        target = self.path(**fields)
        return target.name, write_bytes(target, encode(payload) + b"\n")


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


def source(name: str) -> Source:
    return SOURCES[name]


def artifact(name: str) -> Artifact:
    return ARTIFACTS[name]


def source_version(name: str) -> str:
    return source(name).version


def artifact_version(name: str) -> str:
    return artifact(name).version


def load_source(name: str) -> Any | None:
    return source(name).load()


def save_source(name: str, payload: Any) -> int:
    return source(name).save(payload)


def write_artifact(name: str, payload: Any, **fields: str) -> tuple[str, int]:
    return artifact(name).save(payload, **fields)


def entry(name: str, *, count: int = 0, shards: list[str] | None = None) -> ArtifactEntry:
    document = artifact(name)
    return ArtifactEntry(
        url=document.url,
        schema=document.version,
        count=count,
        shards=list(shards or []),
    )


def artifact_paths(langs: list[str], shard_keys: list[str], checkpoint_shards: int) -> set[str]:
    names = {
        artifact("index").path().name,
        artifact("graph").path().name,
        artifact("wordcount").path().name,
        artifact("missions").path().name,
        artifact("varReads").path().name,
        artifact("flagFacts").path().name,
    }
    for lang in langs:
        names.add(artifact("textHead").path(lang=lang).name)
        for key in shard_keys:
            names.add(artifact("textShard").path(lang=lang, key=key).name)
    for index in range(checkpoint_shards):
        names.add(artifact("checkpoints").path(index=str(index)).name)
    return names
