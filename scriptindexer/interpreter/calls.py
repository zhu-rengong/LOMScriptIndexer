import re
from collections.abc import Sequence
from typing import Any

from .. import lua
from ..calendar import rounds_of
from ..schema import (
    CheckCondition,
    CompareCondition,
    ConditionNode,
    ConstCondition,
)
from ..script_model import (
    CharRef,
    CheckMark,
    CheckRef,
    ChoiceBeat,
    ChoiceOption,
    JumpBeat,
    LockedOption,
    MetaBeat,
    SayBeat,
    SceneBeat,
    TextRef,
    Unevaluated,
)
from ..vocab import CHECK_POSITION
from .spec import Semantics
from .state import (
    ChoiceDraft,
    EvalState,
    OptionDraft,
    lua_key_sort_key,
    source_snippet,
    unwrap_text,
)

HIDDEN_PREFIX = "~"
_LITERAL = re.compile(r'"([^"]*)"')


def callee(expr: lua.Node) -> tuple[str, str]:
    name = expr.child_by_field_name("name")
    if name is None:
        return "", lua.render_source(expr)
    if name.type == "identifier":
        return "", lua.render_source(name)
    if name.type == "method_index_expression":
        return (
            _receiver(name.child_by_field_name("table")),
            lua.render_source(name.child_by_field_name("method")),
        )
    if name.type == "dot_index_expression":
        receiver = _receiver(name.child_by_field_name("table"))
        if receiver:
            return receiver, lua.render_source(name.child_by_field_name("field"))
    return "", lua.render_source(name)


def _receiver(node: lua.Node | None) -> str:
    if node is None:
        return ""
    if node.type == "identifier":
        return lua.render_source(node)
    if node.type == "dot_index_expression":
        base = _receiver(node.child_by_field_name("table"))
        key = lua.render_source(node.child_by_field_name("field"))
        return f"{base}.{key}" if base else key
    if node.type == "method_index_expression":
        base = _receiver(node.child_by_field_name("table"))
        key = lua.render_source(node.child_by_field_name("method"))
        return f"{base}.{key}" if base else key
    if node.type == "parenthesized_expression":
        children = node.named_children
        return _receiver(children[0]) if children else ""
    return lua.render_source(node)


def dialog_style_of(arg: Any, table_name: str) -> str:
    if arg.type != "dot_index_expression":
        return ""
    table = arg.child_by_field_name("table")
    if table is not None and table.type == "identifier" and lua.render_source(table) == table_name:
        return lua.index_key(arg) or ""
    return ""


class CallHandler:
    def __init__(self, analyzer: Any) -> None:
        self.analyzer = analyzer

    @property
    def semantics(self) -> Semantics:
        return self.analyzer.semantics

    def eval_call(self, expr: lua.Node, state: EvalState) -> Any:
        obj, method = callee(expr)
        args = lua.arguments(expr)
        if method == self.semantics.story_getter and args:
            key = unwrap_text(self.analyzer.expressions.eval(args[0], state))
            return TextRef(key, is_locale_key=True) if key else Unevaluated(lua.render_source(expr))
        if (
            obj == self.semantics.character_object
            and method == self.semantics.character_get
            and args
        ):
            character_id = unwrap_text(self.analyzer.expressions.eval(args[0], state))
            return CharRef(character_id) if character_id else Unevaluated(lua.render_source(expr))
        if (
            obj == self.semantics.character_object
            and method == self.semantics.character_portrait
            and args
        ):
            character_id = unwrap_text(self.analyzer.expressions.eval(args[0], state)) or ""
            portrait_id = (
                unwrap_text(self.analyzer.expressions.eval(args[1], state)) if len(args) > 1 else ""
            )
            return CharRef(f"{character_id}:{portrait_id}")
        if obj == self.semantics.check_object and method in self.semantics.check_methods and args:
            key = unwrap_text(self.analyzer.expressions.eval(args[0], state))
            self.analyzer.context.add_check(self.semantics.check_methods[method], key or "")
            if key and method == "Position":
                self.analyzer.context.add_position(key)
            return CheckMark(self.semantics.check_methods[method], key or lua.render_source(expr))
        return Unevaluated(lua.render_source(expr))

    def handle_call(self, call: lua.Node, state: EvalState, beats: list[Any]) -> ChoiceDraft | None:
        obj, method = callee(call)
        args = lua.arguments(call)

        for arg in args:
            if arg.type == "function_call":
                inner_obj, inner_method = callee(arg)
                inner_args = lua.arguments(arg)
                if (
                    inner_obj == self.semantics.dice_object
                    and inner_method == self.semantics.dice_roll_methods[0]
                    and inner_args
                ):
                    state.menu_options = self.option_list(
                        self.analyzer.expressions.eval(inner_args[0], state)
                    )

        if method == self.semantics.say_method and not obj:
            self._say(state, args, beats)
            return None

        if method == self.semantics.speaker_method and not obj:
            if args:
                value = self.analyzer.expressions.eval(args[0], state)
                state.speaker = value.id.split(":")[0] if isinstance(value, CharRef) else None
                if len(args) > 1:
                    self.apply_portrait(state, self.analyzer.expressions.eval(args[1], state))
            return None

        if (
            obj == self.semantics.character_object
            and method == self.semantics.character_load_portrait
            and len(args) > 1
        ):
            character = unwrap_text(self.analyzer.expressions.eval(args[0], state))
            expression = unwrap_text(self.analyzer.expressions.eval(args[1], state))
            if character and expression:
                state.portraits[character] = expression
            return None

        if obj == self.semantics.stage_object:
            if method == self.semantics.stage_portrait_method and len(args) > 1:
                self.apply_portrait(state, self.analyzer.expressions.eval(args[1], state))
                return None
            if method == self.semantics.stage_show_method and args:
                settings = self.analyzer.expressions.eval(args[0], state)
                if isinstance(settings, dict):
                    self.apply_portrait(state, settings.get("portrait"))
                return None

        if method == self.semantics.dialog_method and not obj:
            dialog_style = dialog_style_of(args[0], "saydialogs") if args else ""
            if not dialog_style and args and args[0].type in lua.INDEX_KINDS:
                dialog_style = unwrap_text(self.analyzer.expressions.eval(args[0], state)) or ""
            if dialog_style:
                state.dialog_style = dialog_style
                state.is_think = dialog_style in self.semantics.think_dialogs
            return None

        if obj == self.semantics.think_object and method == self.semantics.think_method:
            state.is_think = bool(args) and lua.render_source(args[0]) == "true"
            return None

        if obj == self.semantics.scene_object and method == self.semantics.init_method:
            state.pending_story_script = None
            state.portraits.clear()
            return None

        if obj == self.semantics.scene_object and method in self.semantics.jumps:
            self.emit_jump(method, args, state, beats)
            return None

        if obj == self.semantics.scene_object and method == self.semantics.scene_method:
            self.emit_scene(args, state, beats)
            state.portraits.clear()
            return None

        if obj == self.semantics.stat_object:
            self.apply_effect(method, args, state, beats)
            return None

        if obj == self.semantics.check_object:
            key = (
                unwrap_text(self.analyzer.expressions.eval(args[0], state))
                if method in self.semantics.check_methods and args
                else None
            )
            if key:
                kind = self.semantics.check_methods[method]
                self.analyzer.context.add_check(kind, key)
                if kind == "position":
                    self.analyzer.context.add_position(key)
            return None

        if obj == self.semantics.time_object and method == self.semantics.time_method:
            self.set_time(args, state, beats)
            return None

        if obj == self.semantics.dice_object and method in self.semantics.dice_roll_methods:
            if method == self.semantics.dice_roll_methods[0] and args:
                state.menu_options = self.option_list(
                    self.analyzer.expressions.eval(args[0], state)
                )
            return None

        if not obj and method == self.semantics.choice_method and args:
            options = self.option_list(self.analyzer.expressions.eval(args[0], state))
            beats.append(None)
            return ChoiceDraft(len(beats) - 1, "", options)

        return None

    def apply_portrait(self, state: EvalState, value: Any) -> None:
        if not isinstance(value, CharRef):
            return
        character, _, expression = value.id.partition(":")
        if character and expression:
            state.portraits[character] = expression

    def set_time(self, args: Sequence[lua.Node], state: EvalState, beats: list[Any]) -> None:
        if len(args) < 3:
            return
        values = [self.analyzer.expressions.eval(arg, state) for arg in args[:3]]
        if any(isinstance(value, bool) or not isinstance(value, int) for value in values):
            return
        rounds = rounds_of(*values)
        if rounds is None:
            return
        self.analyzer.context.set_time(rounds)
        beats.append(MetaBeat("time", "", rounds))

    def _say(self, state: EvalState, args: Sequence[lua.Node], beats: list[Any]) -> None:
        if not args:
            return
        value = self.analyzer.expressions.eval(args[0], state)
        ref = value if isinstance(value, TextRef) else TextRef(source_snippet(args[0]))
        mode = "dialog"
        if state.speaker is None or state.dialog_style in self.semantics.narration_dialogs:
            mode = "narration"
        if state.dialog_style in self.semantics.think_dialogs or state.is_think:
            mode = "think"
        speaker = state.speaker if mode in ("dialog", "think") else None
        if speaker in self.semantics.speaker_sentinels:
            speaker = None
        expression = state.portraits.get(speaker, "") if speaker else ""
        beats.append(SayBeat(speaker, ref, mode, expression))
        self.analyzer.context.say_count += 1

    def apply_effect(
        self, method: str, args: Sequence[lua.Node], state: EvalState, beats: list[Any]
    ) -> None:
        spec = self.semantics.effects.get(method)
        if spec is None or not args:
            return

        def arg_text(index: int) -> str | None:
            if index >= len(args):
                return None
            return unwrap_text(self.analyzer.expressions.eval(args[index], state))

        def arg_int(index: int, fallback: int) -> int:
            if index >= len(args):
                return fallback
            value = self.analyzer.expressions.eval(args[index], state)
            return value if isinstance(value, int) and not isinstance(value, bool) else fallback

        key = arg_text(spec.key_index)
        if not key and spec.key_fallback is not None:
            key = arg_text(spec.key_fallback)
        if not key:
            return
        value = None
        if spec.value_index is not None:
            value = arg_int(spec.value_index, spec.value_delta)
        hidden = False
        if spec.display_index is not None:
            hidden = arg_int(spec.display_index, 1) != 1
        extra = ""
        if spec.extra_index is not None:
            extra = arg_text(spec.extra_index) or ""
        if spec.kind == "story":
            self.analyzer.context.add_lore_key(key)
        beats.append(MetaBeat(spec.kind, key, value, hidden, extra))

    def emit_jump(
        self, method: str, args: Sequence[lua.Node], state: EvalState, beats: list[Any]
    ) -> None:
        target_expr = args[-1] if args else None
        kind = self.semantics.jumps[method]
        value = (
            self.analyzer.expressions.eval(target_expr, state) if target_expr is not None else None
        )
        if isinstance(value, CheckMark) and value.kind == CHECK_POSITION:
            beats.append(JumpBeat(None, "", value.key))
            return
        target = unwrap_text(value)
        if target is None:
            source = lua.render_source(target_expr) if target_expr is not None else ""
            self.analyzer.context.unresolved_jumps.append(f"{method}({source})")
            beats.append(JumpBeat(None, f"{method}({source})"))
            return
        if method in self.semantics.story_jumps:
            state.pending_story_script = target
        beats.append(JumpBeat(target, ""))
        self.analyzer.context.add_edge(target, kind, "")

    def emit_scene(self, args: Sequence[lua.Node], state: EvalState, beats: list[Any]) -> None:
        values = ["", "", ""]
        for index in range(min(len(args), self.semantics.scene_arg_count)):
            values[index] = unwrap_text(self.analyzer.expressions.eval(args[index], state)) or ""
        after_script = ""
        if values[2].lower() == "story" and state.pending_story_script:
            after_script = state.pending_story_script
            self.drop_story_jump(beats, after_script)
            state.pending_story_script = None
        beats.append(SceneBeat(values[0], values[1], values[2], after_script))
        self.analyzer.context.scene_count += 1

    @staticmethod
    def drop_story_jump(beats: list[Any], target: str) -> None:
        for index in range(len(beats) - 1, -1, -1):
            beat = beats[index]
            if isinstance(beat, JumpBeat) and beat.target == target:
                del beats[index]
                return

    def option_list(self, table: Any) -> list[OptionDraft]:
        options: list[OptionDraft] = []
        if not isinstance(table, dict):
            return options
        for key in sorted(table, key=lua_key_sort_key):
            value = table[key]
            if isinstance(value, LockedOption):
                ref = (
                    value.shown_text
                    if isinstance(value.shown_text, TextRef)
                    else TextRef(unwrap_text(value.shown_text) or "")
                )
                if not ref.text or ref.text.startswith(HIDDEN_PREFIX):
                    continue
                lock = value.locked_text if isinstance(value.locked_text, TextRef) else None
                options.append(OptionDraft(ref, None, lock, value.condition))
                continue
            if isinstance(value, TextRef) and not value.is_locale_key:
                if value.text and not value.text.startswith(HIDDEN_PREFIX):
                    options.append(OptionDraft(value))
                continue
            if isinstance(value, Unevaluated):
                literal = self.literal_of(value.source)
                if literal and not literal.startswith(HIDDEN_PREFIX):
                    options.append(OptionDraft(TextRef(literal)))
                continue
            text = unwrap_text(value)
            if text and not text.startswith(HIDDEN_PREFIX):
                options.append(OptionDraft(TextRef(text)))
        return options

    @staticmethod
    def literal_of(source: str) -> str | None:
        matches = _LITERAL.findall(source)
        for candidate in matches:
            if not candidate.startswith(HIDDEN_PREFIX):
                return candidate
        return matches[0] if matches else None

    @staticmethod
    def option_branch(option: OptionDraft, sub: list[Any]) -> ChoiceOption:
        return ChoiceOption(
            option.ref, option.requirement, option.lock, tuple(sub), option.condition
        )

    def if_uses_choice(self, stmt: lua.Node, result_var: str) -> bool:
        for cond, _ in lua.if_clauses(stmt):
            if cond is not None and self.choice_index(cond, result_var) is not None:
                return True
        return False

    @staticmethod
    def choice_index(cond: lua.Node, result_var: str) -> int | None:
        if cond.type != "binary_expression" or lua.operator_token(cond) != "==":
            return None
        left = cond.child_by_field_name("left")
        right = cond.child_by_field_name("right")
        if left is None or right is None:
            return None
        if (
            left.type == "identifier"
            and lua.render_source(left) == result_var
            and right.type == "number"
        ):
            return int(lua.number_value(right))
        if (
            right.type == "identifier"
            and lua.render_source(right) == result_var
            and left.type == "number"
        ):
            return int(lua.number_value(left))
        return None

    def fill_choice(
        self, pending: ChoiceDraft, stmt: lua.Node, state: EvalState, beats: list[Any]
    ) -> None:
        option_map = {index: option for index, option in enumerate(pending.options, start=1)}
        branches: list[ChoiceOption] = []
        for cond, body in lua.if_clauses(stmt):
            if cond is None:
                option = OptionDraft(TextRef(""))
            else:
                index = self.choice_index(cond, pending.result_var)
                option = option_map.get(index) if index is not None else None
                if option is None:
                    option = OptionDraft(TextRef(lua.render_source(cond)))
            sub: list[Any] = []
            self.analyzer.block(body, state.clone(), sub)
            branches.append(self.option_branch(option, sub))
        beats[pending.index] = ChoiceBeat(tuple(branches))

    def close_incomplete(self, pending: ChoiceDraft, beats: list[Any]) -> None:
        beats[pending.index] = ChoiceBeat(
            tuple(self.option_branch(option, []) for option in pending.options)
        )


def check_ref_of(node: ConditionNode | None) -> CheckRef | None:
    if isinstance(node, CheckCondition):
        return CheckRef(node.kind, node.key)
    if not isinstance(node, CompareCondition):
        return None
    for side, other in ((node.left, node.right), (node.right, node.left)):
        if isinstance(side, CheckCondition) and isinstance(other, ConstCondition):
            result = _int_value(other.value)
            if result is not None:
                return CheckRef(side.kind, side.key, result)
    return None


def _int_value(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    try:
        return int(str(value))
    except TypeError, ValueError:
        return None
