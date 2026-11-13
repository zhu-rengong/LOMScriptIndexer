from typing import Any

from ..schema import (
    CompareCondition,
    ConditionNode,
    ConstCondition,
    DiceAddition,
    DiceCondition,
    GroupCondition,
    LogicCondition,
    RandomCondition,
    VarCondition,
)
from ..vocab import (
    COMPARE_OP_SYMBOL,
    GROUP_OP_KIND,
    ITEM_KINDS,
    LOGIC_OP_KIND,
    VALUE_CONST,
    VALUE_GROUP,
    VALUE_KIND_BY_CODE,
    VALUE_RANDOM,
    VALUE_TALENT,
)
from .assets import FileScope
from .unity_fields import DICE_FIELD_BY_KIND, DICE_NAME_KINDS, VALUE_FIELD_BY_KIND
from .unity_objects import object_name, typetree_or_none

MAX_BRANCH_DEPTH = 3


def display_name_of(obj: Any, path_id: Any = None) -> str:
    return object_name(obj, str(path_id) if path_id else "")


def typetree_of(obj: Any) -> dict[str, Any] | None:
    return typetree_or_none(obj)


def unity_item_id(obj: Any) -> str:
    tree = typetree_of(obj) or {}
    value = tree.get("_id")
    if isinstance(value, bool):
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, int):
        return str(value)
    return ""


def _kind_of(code: Any) -> str | None:
    if isinstance(code, bool) or not isinstance(code, int):
        return None
    return VALUE_KIND_BY_CODE.get(code)


def _compare_symbol(code: Any) -> str:
    if isinstance(code, int) and code in COMPARE_OP_SYMBOL:
        return COMPARE_OP_SYMBOL[code]
    return "?"


def _group_kind(code: Any) -> str:
    if isinstance(code, int) and code in GROUP_OP_KIND:
        return GROUP_OP_KIND[code]
    return "sum"


def _logic_kind(code: Any) -> str:
    if isinstance(code, int) and code in LOGIC_OP_KIND:
        return LOGIC_OP_KIND[code]
    return "and"


def const_node(value: Any) -> ConstCondition:
    return ConstCondition(value=value)


def random_node(lo: Any, hi: Any) -> RandomCondition:
    return RandomCondition(min=lo, max=hi)


def dice_node() -> DiceCondition:
    return DiceCondition()


def var_node(kind: str, display_name: str, negative: bool, unity_id: str = "") -> VarCondition:
    return VarCondition(kind=kind, name=display_name, negative=negative, id=unity_id)


def compare_node(op: Any, left: ConditionNode, right: ConditionNode) -> CompareCondition:
    return CompareCondition(op=_compare_symbol(op), left=left, right=right)


def logic_node(op: Any, items: list[ConditionNode]) -> LogicCondition:
    return LogicCondition(op=_logic_kind(op), items=items)


def group_node(ref: Any, scope: FileScope, depth: int = 0) -> ConditionNode | None:
    obj, child_scope = scope.resolve_or_empty(ref)
    tree = typetree_of(obj)
    if not tree:
        return None
    name = display_name_of(obj)
    if depth >= MAX_BRANCH_DEPTH:
        return GroupCondition(op=_group_kind(tree.get("_groupType")), name=name, items=[])
    items = [value_node(record, child_scope, depth + 1) for record in tree.get("_value") or []]
    if any(node is None for node in items):
        return None
    return GroupCondition(
        op=_group_kind(tree.get("_groupType")),
        name=name,
        items=[node for node in items if node is not None],
    )


def value_node(
    value_record: dict[str, Any], scope: FileScope, depth: int = 0
) -> ConditionNode | None:
    check = value_record.get("_checkType", 0)
    kind = _kind_of(check)
    negative = bool(value_record.get("_negative", 0))
    if kind == VALUE_CONST:
        return const_node(value_record.get("_constant", 0))
    if kind == VALUE_RANDOM:
        return random_node(value_record.get("_randomMin", 0), value_record.get("_randomMax", 0))
    if kind == VALUE_GROUP:
        node = group_node(value_record.get("_statGroup"), scope, depth)
        if node is None:
            return None
        if isinstance(node, GroupCondition):
            node.negative = negative
        return node
    if kind is None:
        return None
    field = VALUE_FIELD_BY_KIND.get(kind)
    ref = value_record.get(field) if field else None
    if not ref:
        return None
    target = scope(ref)
    if target is None:
        return None
    unity_id = unity_item_id(target) if kind in ITEM_KINDS else ""
    return var_node(kind, display_name_of(target), negative, unity_id)


def compare_node_of(item: dict[str, Any], scope: FileScope) -> ConditionNode | None:
    left = group_node(item.get("_value1"), scope)
    right = group_node(item.get("_value2"), scope)
    if left is None or right is None:
        return None
    return compare_node(item.get("_compareOp", 0), left, right)


def condition_node(item: dict[str, Any], scope: FileScope) -> ConditionNode | None:
    subs = item.get("_items") or []
    nodes = [compare_node_of(sub, scope) for sub in subs]
    if not nodes or any(node is None for node in nodes):
        return None
    if len(nodes) == 1:
        return nodes[0]
    return logic_node(item.get("_logicOp", 0), [node for node in nodes if node is not None])


def dice_branch_node(item: dict[str, Any]) -> ConditionNode | None:
    nodes = [
        compare_node(sub.get("_compareOp", 0), dice_node(), const_node(sub.get("_value", 0)))
        for sub in item.get("_items") or []
    ]
    if not nodes:
        return None
    return nodes[0] if len(nodes) == 1 else logic_node(0, nodes)


def dice_addition(item: dict[str, Any], scope: FileScope) -> DiceAddition:
    code = item.get("_type", 0)
    kind = (
        DICE_NAME_KINDS.get(code) if isinstance(code, int) and not isinstance(code, bool) else None
    )
    field = DICE_FIELD_BY_KIND.get(kind) if kind else None
    ref = item.get(field) if field else None
    target = scope(ref) if ref else None
    name = display_name_of(target, (ref or {}).get("m_PathID")) if ref else ""
    unity_id = ""
    if kind == VALUE_TALENT and target is not None:
        unity_id = str((typetree_of(target) or {}).get("_id") or "")
    try:
        rate = float(item.get("_rate", 1))
    except TypeError, ValueError:
        rate = 1.0
    return DiceAddition(
        kind=kind or "",
        name=name,
        id=unity_id,
        rate=rate,
        negative=bool(item.get("_negative", 0)),
        hide=bool(item.get("_autoHide", 0)),
    )
