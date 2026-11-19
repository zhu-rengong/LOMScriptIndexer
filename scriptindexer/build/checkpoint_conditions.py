from collections import Counter
from collections.abc import Mapping

from ..schema import CheckpointCondition


def count_by_kind(checkpoints: Mapping[str, CheckpointCondition]) -> dict[str, int]:
    return dict(Counter(condition.kind or "?" for condition in checkpoints.values()))
