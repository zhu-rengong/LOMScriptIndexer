import msgspec

from .base import Wire, schema_digest
from .beats import BeatNode
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
from .missions import MissionDocument
from .text import TextHeadPayload, TextShardPayload, WordCountPayload


class ArtifactEntry(Wire):
    url: str = ""
    schema: str = ""
    count: int = 0
    shards: list[str] = msgspec.field(default_factory=list)


class DataIndex(Wire):
    schema: str = ""
    generated: str = ""
    langs: list[str] = msgspec.field(default_factory=list)
    default_lang: str = ""
    source_lang: str = ""
    artifacts: dict[str, ArtifactEntry] = msgspec.field(default_factory=dict)


class Contract(msgspec.Struct):
    graph: GraphPayload
    text_head: TextHeadPayload
    text_shard: TextShardPayload
    word_count: WordCountPayload
    missions: MissionDocument
    checkpoints: CheckpointDocument
    lore: LoreDocument
    stats: StatsDocument
    entries: EntriesDocument
    battles: BattleDocument
    var_reads: VarReadsPayload
    flag_facts: FlagFactsPayload
    index: DataIndex
    beat: BeatNode


def contract_version() -> str:
    return schema_digest(Contract)
