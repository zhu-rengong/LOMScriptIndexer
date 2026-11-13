from collections.abc import Callable

import msgspec

from .base import Wire


class Condition(msgspec.Struct, rename="camel", omit_defaults=True, tag_field="tag"):
    pass


class ConstCondition(Condition, tag="const"):
    value: int | float | str | bool | None = None


class RandomCondition(Condition, tag="random"):
    min: int | float | None = None
    max: int | float | None = None


class DiceCondition(Condition, tag="dice"):
    negative: bool = False


class VarCondition(Condition, tag="var"):
    kind: str = ""
    name: str = ""
    key: str = ""
    id: str = ""
    negative: bool = False


class CompareCondition(Condition, tag="compare"):
    op: str = ""
    left: ConditionNode | None = None
    right: ConditionNode | None = None


class LogicCondition(Condition, tag="logic"):
    op: str = ""
    items: list[ConditionNode] = msgspec.field(default_factory=list)


class GroupCondition(Condition, tag="group"):
    op: str = "sum"
    name: str = ""
    items: list[ConditionNode] = msgspec.field(default_factory=list)
    negative: bool = False


class CheckCondition(Condition, tag="check"):
    kind: str = ""
    key: str = ""
    negative: bool = False


class RawCondition(Condition, tag="raw"):
    text: str = ""


ConditionNode = (
    ConstCondition
    | RandomCondition
    | DiceCondition
    | VarCondition
    | CompareCondition
    | LogicCondition
    | GroupCondition
    | CheckCondition
    | RawCondition
)


class ConditionItem(Wire):
    note: str = ""
    expr: ConditionNode | None = None


class Branch(Wire):
    result: int = 0
    expr: ConditionNode | None = None


class CountItem(Wire):
    op: str = ""
    value: int | float | None = None
    result: int = 0


class DiceAddition(Wire):
    kind: str = ""
    name: str = ""
    key: str = ""
    id: str = ""
    rate: float = 1.0
    negative: bool = False
    hide: bool = False


class PositionAdjustment(Wire):
    rate: int = 0
    condition: ConditionNode | None = None


class PositionCandidate(Wire):
    name: str = ""
    rate: int = 0
    active: bool = True
    active_condition: ConditionNode | None = None
    active_empty: bool = False
    adjustments: list[PositionAdjustment] = msgspec.field(default_factory=list)


def children(node: ConditionNode) -> list[ConditionNode]:
    if isinstance(node, CompareCondition):
        return [item for item in (node.left, node.right) if item is not None]
    if isinstance(node, (LogicCondition, GroupCondition)):
        return list(node.items)
    return []


def walk_conditions(
    node: ConditionNode | None,
    on_var: Callable[[VarCondition], None] | None = None,
    on_check: Callable[[CheckCondition], None] | None = None,
) -> None:
    if node is None:
        return
    if isinstance(node, VarCondition):
        if on_var is not None:
            on_var(node)
        return
    if isinstance(node, CheckCondition):
        if on_check is not None:
            on_check(node)
        return
    for child in children(node):
        walk_conditions(child, on_var, on_check)


def var_keys(node: ConditionNode | None, kind: str) -> set[str]:
    found: set[str] = set()

    def collect(item: VarCondition) -> None:
        if item.kind == kind and item.key:
            found.add(item.key)

    walk_conditions(node, on_var=collect)
    return found


def check_keys(node: ConditionNode | None) -> set[str]:
    found: set[str] = set()

    def collect(item: CheckCondition) -> None:
        if item.key:
            found.add(item.key)

    walk_conditions(node, on_check=collect)
    return found


def has_expression(node: ConditionNode | None) -> bool:
    return node is not None
