import msgspec

from .base import Wire
from .conditions import Branch, CountItem, DiceAddition, PositionCandidate


class CheckpointCondition(Wire):
    kind: str = ""
    note: str = ""
    use_count: bool = False
    fallback: int | None = None
    default: int | None = None
    prefix: str = ""
    branches: list[Branch] = msgspec.field(default_factory=list)
    count_items: list[CountItem] = msgspec.field(default_factory=list)
    additions: list[DiceAddition] = msgspec.field(default_factory=list)
    candidates: list[PositionCandidate] = msgspec.field(default_factory=list)
    variants: list[CheckpointCondition] = msgspec.field(default_factory=list)


class CheckpointDocument(Wire):
    schema: str = ""
    items: dict[str, CheckpointCondition] = msgspec.field(default_factory=dict)
    gaps: list[dict[str, str]] = msgspec.field(default_factory=list)
