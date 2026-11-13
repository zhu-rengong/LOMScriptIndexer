from typing import Any

from .. import lua
from ..schema import (
    CheckCondition,
    CompareCondition,
    ConditionNode,
    ConstCondition,
    LogicCondition,
    RawCondition,
    VarCondition,
)
from ..script_model import CheckMark, LockedOption, MetaBeat, TextRef, Unevaluated
from .calls import callee
from .state import ChoiceDraft, EvalState, number_text, source_snippet, unwrap_text

_COMPARE_SYMBOL = {
    "==": "=",
    "~=": "≠",
    "<": "<",
    "<=": "≤",
    ">": ">",
    ">=": "≥",
}


class ExpressionEvaluator:
    def __init__(self, analyzer: Any) -> None:
        self.analyzer = analyzer

    @property
    def semantics(self) -> Any:
        return self.analyzer.semantics

    def eval(self, expr: lua.Node, state: EvalState) -> Any:
        kind = expr.type
        if kind == "string":
            return TextRef(lua.string_value(expr))
        if kind == "number":
            return int(lua.number_value(expr))
        if kind == "nil":
            return None
        if kind == "true":
            return True
        if kind == "false":
            return False
        if kind == "identifier":
            name = lua.render_source(expr)
            return state.env.get(name, Unevaluated(name))
        if kind in lua.INDEX_KINDS:
            return self._index(expr, state)
        if kind == "table_constructor":
            return self._table(expr, state)
        if kind == "unary_expression":
            return self._unary(expr, state)
        if kind == "binary_expression":
            return self._binary(expr, state)
        if kind == "function_call":
            return self.analyzer.calls.eval_call(expr, state)
        if kind == "parenthesized_expression":
            children = expr.named_children
            return self.eval(children[0], state) if children else Unevaluated("")
        return Unevaluated(lua.render_source(expr))

    def _index(self, expr: lua.Node, state: EvalState) -> Any:
        base = self.eval(expr.child_by_field_name("table"), state)
        field = expr.child_by_field_name("field")
        key = (
            lua.index_key(expr) or unwrap_text(self.eval(field, state)) or lua.render_source(field)
        )
        if isinstance(base, dict):
            return base.get(key, Unevaluated(lua.render_source(expr)))
        return Unevaluated(lua.render_source(expr))

    def _table(self, expr: lua.Node, state: EvalState) -> dict[str, Any]:
        table: dict[str, Any] = {}
        auto_index = 1
        for field in expr.named_children:
            if field.type != "field":
                continue
            value = self.eval(field.child_by_field_name("value"), state)
            key = lua.field_key(field)
            if key is None and lua.field_has_key(field):
                name = field.child_by_field_name("name")
                key = unwrap_text(self.eval(name, state)) or lua.render_source(name)
            if key is None:
                table[str(auto_index)] = value
                auto_index += 1
            else:
                table[key] = value
        return table

    def _unary(self, expr: lua.Node, state: EvalState) -> Any:
        operand = self.eval(expr.child_by_field_name("operand"), state)
        if (
            lua.operator_token(expr) == "-"
            and isinstance(operand, int)
            and not isinstance(operand, bool)
        ):
            return -operand
        return Unevaluated(lua.render_source(expr))

    def _binary(self, expr: lua.Node, state: EvalState) -> Any:
        op = lua.operator_token(expr)
        left_node = expr.child_by_field_name("left")
        right_node = expr.child_by_field_name("right")
        if op == "..":
            left = unwrap_text(self.eval(left_node, state))
            right = unwrap_text(self.eval(right_node, state))
            if left is not None and right is not None:
                return TextRef(left + right)
            return Unevaluated(lua.render_source(expr))
        if op == "or":
            if (
                left_node.type == "binary_expression"
                and lua.operator_token(left_node) == "and"
                and right_node.type == "string"
                and lua.string_value(right_node).startswith("~")
            ):
                guard = left_node.child_by_field_name("left")
                return LockedOption(
                    shown_text=self.eval(left_node.child_by_field_name("right"), state),
                    locked_text=TextRef(lua.string_value(right_node).lstrip("~")),
                    condition=self.cond_node(guard, state) if guard is not None else None,
                )
            left = self.eval(left_node, state)
            return left if isinstance(left, TextRef) else self.eval(right_node, state)
        if op == "and":
            return self.eval(right_node, state)
        return Unevaluated(lua.render_source(expr))

    def eval_stmt_value(
        self, expr: lua.Node, state: EvalState, beats: list[Any]
    ) -> tuple[Any, ChoiceDraft | None]:
        if expr.type == "dot_index_expression":
            table = expr.child_by_field_name("table")
            if (
                table is not None
                and table.type == "identifier"
                and lua.render_source(table) == self.semantics.dice_object
                and lua.index_key(expr) == self.semantics.dice_result_field
            ):
                beats.append(None)
                return (
                    Unevaluated(lua.render_source(expr)),
                    ChoiceDraft(len(beats) - 1, "", list(state.menu_options)),
                )
        if expr.type == "function_call":
            obj, method = callee(expr)
            args = lua.arguments(expr)
            if not obj and method == self.semantics.choice_method and args:
                options = self.analyzer.calls.option_list(self.eval(args[0], state))
                beats.append(None)
                return Unevaluated(lua.render_source(expr)), ChoiceDraft(
                    len(beats) - 1, "", options
                )
            if obj == self.semantics.check_object and method in self.semantics.check_methods:
                value = self.eval(expr, state)
                if isinstance(value, CheckMark) and method == "Dice":
                    beats.append(MetaBeat("dice", value.key))
                return value, None
            return self.eval(expr, state), None
        return self.eval(expr, state), None

    def cond_node(self, cond: lua.Node, state: EvalState) -> ConditionNode:
        kind = cond.type
        if kind == "function_call":
            obj, method = callee(cond)
            args = lua.arguments(cond)
            if (
                obj == self.semantics.stat_object
                and method.startswith(self.semantics.stat_getter_prefix)
                and args
            ):
                key = unwrap_text(self.eval(args[0], state)) or lua.render_source(args[0]).strip(
                    "\"'"
                )
                return VarCondition(kind="stat", key=key)
            value = self.eval(cond, state)
            if isinstance(value, CheckMark):
                return CheckCondition(kind=value.kind, key=value.key)
            return RawCondition(text=source_snippet(cond))
        if kind == "binary_expression":
            op = lua.operator_token(cond)
            left_node = cond.child_by_field_name("left")
            right_node = cond.child_by_field_name("right")
            if op in ("and", "or"):
                return LogicCondition(
                    op=op,
                    items=[self.cond_node(left_node, state), self.cond_node(right_node, state)],
                )
            return CompareCondition(
                op=_COMPARE_SYMBOL.get(op, op),
                left=self.cond_node(left_node, state),
                right=self.cond_node(right_node, state),
            )
        if kind == "identifier":
            value = state.env.get(lua.render_source(cond))
            if isinstance(value, CheckMark):
                return CheckCondition(kind=value.kind, key=value.key)
            if isinstance(value, (str, int)) and not isinstance(value, bool):
                return ConstCondition(value=value)
            return RawCondition(text=lua.render_source(cond))
        if kind == "string":
            return ConstCondition(value=lua.string_value(cond))
        if kind == "number":
            return ConstCondition(value=number_text(lua.number_value(cond)))
        if kind == "unary_expression" and lua.operator_token(cond) == "-":
            operand = cond.child_by_field_name("operand")
            if operand is not None and operand.type == "number":
                return ConstCondition(value=number_text(-lua.number_value(operand)))
            return RawCondition(text=source_snippet(cond))
        return RawCondition(text=source_snippet(cond))
