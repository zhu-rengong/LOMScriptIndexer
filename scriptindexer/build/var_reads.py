from collections.abc import Mapping

from ..schema import (
    CheckpointCondition,
    ConditionNode,
    VarCondition,
    VarReadsPayload,
    walk_conditions,
)
from ..vocab import VALUE_FLAG, VALUE_REL, VALUE_STAT
from .checkpoint_visit import walk_checkpoint

READ_KINDS = (VALUE_FLAG, VALUE_STAT, VALUE_REL)
CHECKPOINT_KIND_FLAG = "flag"


class _ReadIndex:
    def __init__(self) -> None:
        self.buckets: dict[str, dict[str, set[str]]] = {kind: {} for kind in READ_KINDS}

    def add(self, kind: str, key: str, checkpoint: str) -> None:
        bucket = self.buckets.get(kind)
        if not key or not checkpoint or bucket is None:
            return
        bucket.setdefault(key, set()).add(checkpoint)

    def payload(self) -> VarReadsPayload:
        return VarReadsPayload(
            flag=self._sorted(VALUE_FLAG),
            stat=self._sorted(VALUE_STAT),
            rel=self._sorted(VALUE_REL),
        )

    def _sorted(self, kind: str) -> dict[str, list[str]]:
        return {key: sorted(values) for key, values in sorted(self.buckets[kind].items())}


def collect_reads(checkpoints: Mapping[str, CheckpointCondition]) -> VarReadsPayload:
    index = _ReadIndex()
    for key, checkpoint in checkpoints.items():
        name = str(key)
        if checkpoint.kind == CHECKPOINT_KIND_FLAG:
            index.add(VALUE_FLAG, name, name)

        def on_var(item: VarCondition, target: str = name) -> None:
            index.add(item.kind, item.key, target)

        def on_expr(node: ConditionNode | None, target: str = name) -> None:
            walk_conditions(node, on_var=on_var)

        walk_checkpoint(
            checkpoint,
            on_expr,
            lambda addition, target=name: index.add(addition.kind, addition.key, target),
        )
    return index.payload()
