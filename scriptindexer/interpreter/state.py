from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from typing import Any

from .. import lua
from ..script_model import CharRef, CheckMark, Requirement, SayBeat, TextRef


@dataclass(frozen=True)
class OptionDraft:
    ref: TextRef
    requirement: Requirement | None = None
    lock: TextRef | None = None
    condition: dict[str, Any] | None = None


@dataclass
class ChoiceDraft:
    index: int
    result_var: str = ""
    options: list[OptionDraft] = field(default_factory=list)


@dataclass(frozen=True)
class PendingSay:
    beats: list[Any]
    beat: SayBeat
    expression: str


@dataclass
class EvalState:
    speaker: str | None = None
    dialog_style: str = ""
    is_think: bool = False
    env: dict[str, Any] = field(default_factory=dict)
    menu_options: list[OptionDraft] = field(default_factory=list)
    pending_story_script: str | None = None
    portraits: dict[str, str] = field(default_factory=dict)
    stage_positions: dict[str, str] = field(default_factory=dict)
    hidden_characters: set[str] = field(default_factory=set)
    view_hidden: bool = False
    pending_says: dict[str, PendingSay] = field(default_factory=dict)

    def clone(self) -> EvalState:
        return EvalState(
            speaker=self.speaker,
            dialog_style=self.dialog_style,
            is_think=self.is_think,
            env=dict(self.env),
            menu_options=list(self.menu_options),
            pending_story_script=self.pending_story_script,
            portraits=dict(self.portraits),
            stage_positions=dict(self.stage_positions),
            hidden_characters=set(self.hidden_characters),
            view_hidden=self.view_hidden,
            pending_says=dict(self.pending_says),
        )

    def merge(self, ends: Sequence[EvalState], offstage: frozenset[str]) -> None:
        if not ends:
            return
        self.portraits.update(_shared(ends, lambda end: end.portraits))
        for character in set().union(*(end.stage_positions for end in ends)):
            views = [_on_screen(end.stage_positions.get(character), offstage) for end in ends]
            if all(view is True for view in views):
                if self.stage_positions.get(character) in offstage:
                    self.stage_positions.pop(character, None)
            elif all(view is False for view in views):
                self.stage_positions[character] = next(
                    end.stage_positions[character]
                    for end in ends
                    if character in end.stage_positions
                )
            else:
                self.stage_positions.pop(character, None)
        for character in set().union(*(end.hidden_characters for end in ends)):
            hidden = [character in end.hidden_characters for end in ends]
            if all(hidden):
                self.hidden_characters.add(character)
            elif not any(hidden):
                self.hidden_characters.discard(character)
        views = {end.view_hidden for end in ends}
        if len(views) == 1:
            self.view_hidden = views.pop()


def _on_screen(position: str | None, offstage: frozenset[str]) -> bool | None:
    if position is None:
        return None
    return position not in offstage


def _shared(
    ends: Sequence[EvalState], pick: Callable[[EvalState], dict[str, str]]
) -> dict[str, str]:
    shared: dict[str, str] = {}
    for key in set().union(*(pick(end).keys() for end in ends)):
        values = {pick(end).get(key) for end in ends}
        if len(values) == 1:
            value = values.pop()
            if value is not None:
                shared[key] = value
    return shared


def unwrap_text(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, TextRef):
        return value.text
    if isinstance(value, CharRef):
        return value.id
    if isinstance(value, CheckMark):
        return value.key
    return None


def source_snippet(expr: lua.Node, limit: int = 120) -> str:
    text = lua.render_source(expr)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def number_text(value: Any) -> str:
    try:
        number = float(value)
    except TypeError, ValueError:
        return str(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


def lua_key_sort_key(value: str) -> tuple[int, int | str]:
    try:
        return (0, int(value))
    except ValueError:
        return (1, value)
