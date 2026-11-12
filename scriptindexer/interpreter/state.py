from dataclasses import dataclass, field
from typing import Any

from .. import lua
from ..script_model import CharRef, CheckMark, Requirement, TextRef


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


@dataclass
class EvalState:
    speaker: str | None = None
    dialog_style: str = ""
    is_think: bool = False
    env: dict[str, Any] = field(default_factory=dict)
    menu_options: list[OptionDraft] = field(default_factory=list)
    pending_story_script: str | None = None
    portraits: dict[str, str] = field(default_factory=dict)

    def clone(self) -> EvalState:
        return EvalState(
            speaker=self.speaker,
            dialog_style=self.dialog_style,
            is_think=self.is_think,
            env=dict(self.env),
            menu_options=list(self.menu_options),
            pending_story_script=self.pending_story_script,
            portraits=dict(self.portraits),
        )


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
    except (TypeError, ValueError):
        return str(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


def lua_key_sort_key(value: str) -> tuple[int, int | str]:
    try:
        return (0, int(value))
    except ValueError:
        return (1, value)
