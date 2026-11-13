from collections.abc import Mapping

from ..schema import CheckpointCondition, VarCondition, VarReadsPayload, walk_conditions
from ..vocab import VALUE_FLAG, VALUE_REL, VALUE_STAT

READ_KINDS = (VALUE_FLAG, VALUE_STAT, VALUE_REL)
CHECKPOINT_KIND_FLAG = "flag"


def _add(index: dict[str, dict[str, set[str]]], kind: str, key: str, checkpoint: str) -> None:
    if not key or not checkpoint:
        return
    bucket = index.get(kind)
    if bucket is None:
        return
    bucket.setdefault(key, set()).add(checkpoint)


def _walk_checkpoint(
    checkpoint: CheckpointCondition, key: str, index: dict[str, dict[str, set[str]]]
) -> None:
    if checkpoint.kind == CHECKPOINT_KIND_FLAG:
        _add(index, VALUE_FLAG, key, key)

    def on_var(item: VarCondition) -> None:
        _add(index, item.kind, item.key, key)

    for branch in checkpoint.branches:
        walk_conditions(branch.expr, on_var=on_var)
    for addition in checkpoint.additions:
        _add(index, addition.kind, addition.key, key)
    for variant in checkpoint.variants:
        _walk_checkpoint(variant, key, index)


def collect_reads(checkpoints: Mapping[str, CheckpointCondition]) -> VarReadsPayload:
    index: dict[str, dict[str, set[str]]] = {kind: {} for kind in READ_KINDS}
    for key, checkpoint in checkpoints.items():
        _walk_checkpoint(checkpoint, str(key), index)
    return VarReadsPayload(
        flag={value: sorted(keys) for value, keys in sorted(index[VALUE_FLAG].items())},
        stat={value: sorted(keys) for value, keys in sorted(index[VALUE_STAT].items())},
        rel={value: sorted(keys) for value, keys in sorted(index[VALUE_REL].items())},
    )
