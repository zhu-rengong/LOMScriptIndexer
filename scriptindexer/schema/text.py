import msgspec

from .base import Wire
from .beats import BeatNode


class TextHeadPayload(Wire):
    schema: str = ""
    lang: str = ""
    characters: dict[str, str] = msgspec.field(default_factory=dict)
    titles: dict[str, str] = msgspec.field(default_factory=dict)
    names: dict[str, dict[str, str]] = msgspec.field(default_factory=dict)
    edge_labels: dict[str, str] = msgspec.field(default_factory=dict)
    missing_key_count: int = 0
    missing_keys: list[str] = msgspec.field(default_factory=list)
    shard_keys: list[str] = msgspec.field(default_factory=list)


class TextShardPayload(Wire):
    schema: str = ""
    lang: str = ""
    key: str = ""
    scripts: dict[str, list[BeatNode]] = msgspec.field(default_factory=dict)


class WordCountLang(Wire):
    chapters: dict[str, list[list[int]]] = msgspec.field(default_factory=dict)
    scripts: dict[str, list[list[int]]] = msgspec.field(default_factory=dict)


class WordCountPayload(Wire):
    schema: str = ""
    kinds: list[str] = msgspec.field(default_factory=list)
    langs: dict[str, WordCountLang] = msgspec.field(default_factory=dict)
