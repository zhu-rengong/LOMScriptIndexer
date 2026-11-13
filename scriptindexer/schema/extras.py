from typing import Any

import msgspec

from .base import Wire


class StatRecord(Wire):
    type: int = 0
    note: str = ""


class StatsDocument(Wire):
    schema: str = ""
    items: dict[str, StatRecord] = msgspec.field(default_factory=dict)


class LoreDocument(Wire):
    schema: str = ""
    items: dict[str, str] = msgspec.field(default_factory=dict)


class EntryStats(Wire):
    ok: bool = False
    reason: str = ""
    classes: dict[str, int] = msgspec.field(default_factory=dict)
    positions: int = 0
    position_targets: int = 0
    positions_unresolved: int = 0
    warnings: int = 0
    elapsed: float = 0.0


class EntriesDocument(Wire):
    schema: str = ""
    fingerprint: str = ""
    generated: str = ""
    position_targets: dict[str, list[str]] = msgspec.field(default_factory=dict)
    unresolved: list[str] = msgspec.field(default_factory=list)
    stats: EntryStats = msgspec.field(default_factory=EntryStats)


class VarReadsPayload(Wire):
    schema: str = ""
    flag: dict[str, list[str]] = msgspec.field(default_factory=dict)
    stat: dict[str, list[str]] = msgspec.field(default_factory=dict)
    rel: dict[str, list[str]] = msgspec.field(default_factory=dict)


class FlagFacts(Wire):
    values: list[str] = msgspec.field(default_factory=list)
    negated: list[str] = msgspec.field(default_factory=list)


class FlagFactsPayload(Wire):
    schema: str = ""
    flags: dict[str, FlagFacts] = msgspec.field(default_factory=dict)


class BattleDocument(Wire):
    schema: str = ""
    items: dict[str, Any] = msgspec.field(default_factory=dict)
