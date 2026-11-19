import msgspec


class ReportPayload(msgspec.Struct):
    schema: str = ""
    generated: str = ""
    scripts: int = 0
    edges: dict[str, int] = msgspec.field(default_factory=dict)
    nodes: dict[str, int] = msgspec.field(default_factory=dict)
    entries: dict[str, object] = msgspec.field(default_factory=dict)
    facets: dict[str, object] = msgspec.field(default_factory=dict)
    checkpoints: dict[str, object] = msgspec.field(default_factory=dict)
    battles: dict[str, object] = msgspec.field(default_factory=dict)
    lore: dict[str, object] = msgspec.field(default_factory=dict)
    missions: dict[str, object] = msgspec.field(default_factory=dict)
    wordcount: dict[str, object] = msgspec.field(default_factory=dict)
    time: dict[str, object] = msgspec.field(default_factory=dict)
    chapters: list[dict[str, object]] = msgspec.field(default_factory=list)
    text: dict[str, object] = msgspec.field(default_factory=dict)
    languages: dict[str, object] = msgspec.field(default_factory=dict)
    unresolved_jumps: list[str] = msgspec.field(default_factory=list)
    analysis: dict[str, object] = msgspec.field(default_factory=dict)
    artifacts: list[dict[str, object]] = msgspec.field(default_factory=list)
