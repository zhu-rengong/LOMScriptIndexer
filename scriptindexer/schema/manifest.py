from typing import Any

import msgspec


class Manifest(msgspec.Struct):
    generated_at: str = ""
    game: str = ""
    fingerprint: str = ""
    stage_versions: dict[str, str] = msgspec.field(default_factory=dict)
    langs: list[str] = msgspec.field(default_factory=list)
    script_count: int = 0
    script_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    anomalies: dict[str, list[str]] = msgspec.field(default_factory=dict)
    locale_keys: dict[str, int] = msgspec.field(default_factory=dict)
    locale_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    checkpoint_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    entry_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    stat_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    mission_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    battle_stats: dict[str, Any] = msgspec.field(default_factory=dict)
    lore_stats: dict[str, Any] = msgspec.field(default_factory=dict)

    def anomaly(self, key: str) -> list[str]:
        return self.anomalies.get(key) or []
