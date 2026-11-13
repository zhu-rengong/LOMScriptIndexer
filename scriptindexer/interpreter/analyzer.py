from collections.abc import Sequence
from typing import Any

from .. import lua
from ..script_model import BranchBeat, ScriptAnalysis
from .calls import CallHandler, check_ref_of
from .context import AnalysisContext
from .expressions import ExpressionEvaluator
from .spec import Semantics
from .state import ChoiceDraft, EvalState, unwrap_text


class Analyzer:
    def __init__(self, script_id: str, semantics: Semantics) -> None:
        self.semantics = semantics
        self.context = AnalysisContext(script_id)
        self.expressions = ExpressionEvaluator(self)
        self.calls = CallHandler(self)

    def analyze(self, source: str) -> ScriptAnalysis:
        chunk = lua.parse(source)
        self.block(chunk.statements, EvalState(), self.context.beats)
        return self.context.snapshot()

    def block(self, stmts: Sequence[lua.Node], state: EvalState, beats: list[Any]) -> None:
        index = 0
        pending: ChoiceDraft | None = None
        while index < len(stmts):
            stmt = stmts[index]
            if (
                stmt.type == "if_statement"
                and pending is not None
                and self.calls.if_uses_choice(stmt, pending.result_var)
            ):
                self.calls.fill_choice(pending, stmt, state, beats)
                pending = None
                index += 1
                continue
            if stmt.type == "if_statement":
                self.emit_branch_group(stmt, state, beats)
                index += 1
                continue
            if stmt.type == "do_statement":
                self.block(lua.statements(stmt.child_by_field_name("body")), state.clone(), beats)
                index += 1
                continue
            produced = self.statement(stmt, state, beats)
            if produced is not None:
                if pending is not None:
                    self.calls.close_incomplete(pending, beats)
                pending = produced
            index += 1
        if pending is not None:
            self.calls.close_incomplete(pending, beats)

    def statement(self, stmt: lua.Node, state: EvalState, beats: list[Any]) -> ChoiceDraft | None:
        kind = stmt.type
        if kind == "variable_declaration":
            targets, values = lua.local_declaration(stmt)
            names = [lua.render_source(target) for target in targets]
            pending: ChoiceDraft | None = None
            for name, expr in zip(names, values, strict=False):
                value, produced = self.expressions.eval_stmt_value(expr, state, beats)
                state.env[name] = value
                if produced is not None:
                    pending = produced
                    pending.result_var = name
            for name in names[len(values) :]:
                state.env[name] = None
            return pending
        if kind == "assignment_statement":
            targets, values = lua.assignment(stmt)
            for target, expr in zip(targets, values, strict=False):
                self.assign(target, expr, state, beats)
            return None
        if kind == "function_call":
            return self.calls.handle_call(stmt, state, beats)
        return None

    def assign(self, target: lua.Node, expr: lua.Node, state: EvalState, beats: list[Any]) -> None:
        value, _ = self.expressions.eval_stmt_value(expr, state, beats)
        if target.type == "identifier":
            state.env[lua.render_source(target)] = value
            return
        if target.type not in lua.INDEX_KINDS:
            return
        table_node = target.child_by_field_name("table")
        if table_node is None or table_node.type != "identifier":
            return
        name = lua.render_source(table_node)
        table = state.env.get(name)
        field = target.child_by_field_name("field")
        key = (
            lua.index_key(target)
            or unwrap_text(self.expressions.eval(field, state))
            or lua.render_source(field)
        )
        if isinstance(table, dict):
            table[key] = value
        else:
            state.env[name] = {key: value}

    def emit_branch_group(self, stmt: lua.Node, state: EvalState, beats: list[Any]) -> None:
        group = self.context.branch_seq
        self.context.branch_seq += 1
        for cond, body in lua.if_clauses(stmt):
            node = self.expressions.cond_node(cond, state) if cond is not None else None
            check = check_ref_of(node)
            sub: list[Any] = []
            self.block(body, state.clone(), sub)
            beats.append(
                BranchBeat(
                    check,
                    node,
                    lua.render_source(cond) if cond is not None else "",
                    tuple(sub),
                    group,
                )
            )


def analyze(script_id: str, source: str, semantics: Semantics) -> ScriptAnalysis:
    return Analyzer(script_id, semantics).analyze(source)
