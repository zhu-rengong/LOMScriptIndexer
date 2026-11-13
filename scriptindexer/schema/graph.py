import msgspec

from .base import Wire


class GameInfo(Wire):
    version: str | None = None
    build: str | None = None
    updated: str | None = None


class CalendarInfo(Wire):
    rounds_per_year: int = 0
    rounds_per_month: int = 0


class ShardInfo(Wire):
    key: str = ""
    node_count: int = 0
    bytes: int = 0
    chapter_ids: list[str] = msgspec.field(default_factory=list)


class VocabPayload(Wire):
    beat_tags: list[str] = msgspec.field(default_factory=list)
    say_modes: list[str] = msgspec.field(default_factory=list)
    edge_kinds: list[str] = msgspec.field(default_factory=list)
    edge_group_by_kind: dict[str, str] = msgspec.field(default_factory=dict)
    facet_kinds: list[str] = msgspec.field(default_factory=list)
    check_kinds: list[str] = msgspec.field(default_factory=list)
    value_kinds: list[str] = msgspec.field(default_factory=list)
    compare_symbols: list[str] = msgspec.field(default_factory=list)
    group_kinds: list[str] = msgspec.field(default_factory=list)
    meta_kinds: list[str] = msgspec.field(default_factory=list)
    item_kinds: list[str] = msgspec.field(default_factory=list)
    chapter_kinds: list[str] = msgspec.field(default_factory=list)


class CountsInfo(Wire):
    scripts: int = 0
    edges: int = 0
    chapters: int = 0
    unresolved_jumps: int = 0


class SystemEntryRow(Wire):
    id: str = ""
    label: str = ""
    origin: str = ""


class Facets(Wire):
    speakers: list[str] = msgspec.field(default_factory=list)
    flags: list[str] = msgspec.field(default_factory=list)
    checks: list[str] = msgspec.field(default_factory=list)
    stats: list[str] = msgspec.field(default_factory=list)
    relations: list[str] = msgspec.field(default_factory=list)
    endings: list[str] = msgspec.field(default_factory=list)
    option_count: int = 0
    lock_count: int = 0
    dice_check_count: int = 0


class NodeFlags(Wire):
    is_empty: bool = False
    is_simplified_only: bool = False
    has_no_outgoing: bool = False
    has_no_incoming: bool = False


class NodeRow(Wire):
    id: str = ""
    chapter_index: int = 0
    out_degree: int = 0
    in_degree: int = 0
    say_count: int = 0
    flags: NodeFlags | None = None
    facets: Facets | None = None
    time: int | None = None


class EdgeRow(Wire):
    index: int = 0
    source: str = ""
    target: str = ""
    kind: str = ""
    label: str = ""


class ChapterRow(Wire):
    id: str = ""
    kind: str = ""
    color: str = ""
    script_count: int = 0
    number: int | None = None


class GraphMeta(Wire):
    generated: str = ""
    game: GameInfo = msgspec.field(default_factory=GameInfo)
    langs: list[str] = msgspec.field(default_factory=list)
    default_lang: str = ""
    source_lang: str = ""
    vocab: VocabPayload = msgspec.field(default_factory=VocabPayload)
    calendar: CalendarInfo = msgspec.field(default_factory=CalendarInfo)
    counts: CountsInfo = msgspec.field(default_factory=CountsInfo)
    shards: list[ShardInfo] = msgspec.field(default_factory=list)
    shard_by_node: dict[str, str] = msgspec.field(default_factory=dict)
    checkpoint_shard_by_key: dict[str, int] = msgspec.field(default_factory=dict)
    system_entries: list[SystemEntryRow] = msgspec.field(default_factory=list)


class GraphPayload(Wire):
    schema: str = ""
    meta: GraphMeta = msgspec.field(default_factory=GraphMeta)
    chapters: list[ChapterRow] = msgspec.field(default_factory=list)
    nodes: list[NodeRow] = msgspec.field(default_factory=list)
    edges: list[EdgeRow] = msgspec.field(default_factory=list)
