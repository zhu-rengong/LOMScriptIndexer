from collections.abc import Mapping

from ..schema import CheckpointCondition


def count_by_kind(checkpoints: Mapping[str, CheckpointCondition]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for condition in checkpoints.values():
        kind = condition.kind or "?"
        counts[kind] = counts.get(kind, 0) + 1
    return counts
