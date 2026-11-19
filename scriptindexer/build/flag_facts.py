from collections.abc import Iterable, Mapping
from typing import Any

from ..scalars import number_text
from ..schema import (
    CheckpointDocument,
    CompareCondition,
    ConditionNode,
    ConstCondition,
    FlagFacts,
    FlagFactsPayload,
    MissionDocument,
    VarCondition,
    children,
)
from ..script_model import BranchBeat, ChoiceBeat, MetaBeat, ScriptAnalysis
from .visit import BeatWalker

FLAG_KIND = "flag"
SET_FLAG_KIND = "setflag"


class _Table:
    def __init__(self) -> None:
        self.values: dict[str, set[str]] = {}
        self.negated: dict[str, set[str]] = {}

    def add(self, flag: str, value: str, negated: bool = False) -> None:
        if not flag or not value:
            return
        bucket = self.negated if negated else self.values
        bucket.setdefault(flag, set()).add(value)

    def payload(self) -> FlagFactsPayload:
        flags = sorted(set(self.values) | set(self.negated))
        return FlagFactsPayload(
            flags={
                flag: FlagFacts(
                    values=_sorted_numbers(self.values.get(flag, set())),
                    negated=_sorted_numbers(self.negated.get(flag, set())),
                )
                for flag in flags
            }
        )


def _sorted_numbers(values: Iterable[str]) -> list[str]:
    def key(value: str) -> tuple[int, float, str]:
        try:
            return 0, float(value), value
        except ValueError:
            return 1, 0.0, value

    return sorted(set(values), key=key)


def _scan(node: ConditionNode | None, table: _Table) -> None:
    if node is None:
        return
    if isinstance(node, VarCondition):
        if node.kind == FLAG_KIND and not node.negative and node.key:
            table.add(node.key, "1")
        return
    if isinstance(node, CompareCondition):
        left, right = node.left, node.right
        flag = None
        other = None
        if isinstance(left, VarCondition) and left.kind == FLAG_KIND:
            flag, other = left, right
        elif isinstance(right, VarCondition) and right.kind == FLAG_KIND:
            flag, other = right, left
        if flag is not None and not flag.negative and isinstance(other, ConstCondition):
            value = number_text(other.value)
            if value:
                table.add(flag.key, value, node.op == "≠")
    for child in children(node):
        _scan(child, table)


class _FlagWalker(BeatWalker):
    def __init__(self, table: _Table) -> None:
        self.table = table

    def meta(self, beat: MetaBeat) -> None:
        if beat.kind == SET_FLAG_KIND and beat.key:
            self.table.add(beat.key, number_text(beat.value))

    def branch(self, beat: BranchBeat) -> None:
        _scan(beat.cond, self.table)
        super().branch(beat)

    def choice(self, beat: ChoiceBeat) -> None:
        for option in beat.options:
            _scan(option.condition, self.table)
        super().choice(beat)


def collect(
    checkpoints: CheckpointDocument | None,
    missions: MissionDocument | None,
    models: Mapping[str, ScriptAnalysis],
) -> FlagFactsPayload:
    table = _Table()
    if checkpoints is not None:
        for checkpoint in checkpoints.items.values():
            _scan_checkpoint(checkpoint, table)
    if missions is not None:
        for record in missions.items.values():
            for state in record.states.values():
                for item in state.conditions:
                    _scan(item.expr, table)
                for change in (*state.modify_flags_true, *state.modify_flags_false):
                    table.add(change.key, number_text(change.value))
    walker = _FlagWalker(table)
    for model in models.values():
        walker.walk(model.beats)
    return table.payload()


def _scan_checkpoint(checkpoint: Any, table: _Table) -> None:
    for branch in checkpoint.branches:
        _scan(branch.expr, table)
    for variant in checkpoint.variants:
        _scan_checkpoint(variant, table)
    for candidate in checkpoint.candidates:
        _scan(candidate.active_condition, table)
        for adjustment in candidate.adjustments:
            _scan(adjustment.condition, table)
