from collections.abc import Callable

from ..schema import CheckpointCondition, ConditionNode, DiceAddition

type ExprHook = Callable[[ConditionNode | None], None]
type AdditionHook = Callable[[DiceAddition], None]


def walk_checkpoint(
    checkpoint: CheckpointCondition,
    on_expr: ExprHook,
    on_addition: AdditionHook | None = None,
) -> None:
    for branch in checkpoint.branches:
        on_expr(branch.expr)
    if on_addition is not None:
        for addition in checkpoint.additions:
            on_addition(addition)
    for candidate in checkpoint.candidates:
        on_expr(candidate.active_condition)
        for adjustment in candidate.adjustments:
            on_expr(adjustment.condition)
    for variant in checkpoint.variants:
        walk_checkpoint(variant, on_expr, on_addition)


def walk_checkpoints(
    checkpoints: dict[str, CheckpointCondition],
    on_expr: ExprHook,
    on_addition: AdditionHook | None = None,
) -> None:
    for checkpoint in checkpoints.values():
        walk_checkpoint(checkpoint, on_expr, on_addition)
