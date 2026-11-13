from typing import Any

import msgspec

from .schema import ConditionNode

BASE = {"frozen": True, "rename": "camel", "omit_defaults": True}


class TextRef(msgspec.Struct, **BASE):
    text: str = ""
    is_locale_key: bool = False


class CharRef(msgspec.Struct, **BASE):
    id: str = ""


class CheckMark(msgspec.Struct, **BASE):
    kind: str = ""
    key: str = ""


class Unevaluated(msgspec.Struct, **BASE):
    source: str = ""


class LockedOption(msgspec.Struct, **BASE):
    shown_text: Any = None
    locked_text: TextRef = msgspec.field(default_factory=TextRef)
    condition: ConditionNode | None = None


class Requirement(msgspec.Struct, **BASE):
    op: str = ""
    operand: str = ""


class CheckRef(msgspec.Struct, **BASE):
    kind: str = ""
    key: str = ""
    expected_result: int | None = None


class BeatBase(msgspec.Struct, frozen=True, rename="camel", omit_defaults=True, tag_field="t"):
    pass


class SayBeat(BeatBase, tag="say", frozen=True):
    speaker: str | None = None
    ref: TextRef = msgspec.field(default_factory=TextRef)
    mode: str = ""
    expression: str = ""


class ChoiceOption(msgspec.Struct, **BASE):
    ref: TextRef = msgspec.field(default_factory=TextRef)
    requirement: Requirement | None = None
    lock: TextRef | None = None
    beats: tuple[Beat, ...] = ()
    condition: ConditionNode | None = None


class ChoiceBeat(BeatBase, tag="choice", frozen=True):
    options: tuple[ChoiceOption, ...] = ()


class BranchBeat(BeatBase, tag="branch", frozen=True):
    check: CheckRef | None = None
    cond: ConditionNode | None = None
    source: str = ""
    beats: tuple[Beat, ...] = ()
    group: int = 0


class JumpBeat(BeatBase, tag="jump", frozen=True):
    target: str | None = None
    dynamic_source: str = ""
    position: str = ""


class MetaBeat(BeatBase, tag="meta", frozen=True):
    kind: str = ""
    key: str = ""
    value: int | None = None
    hidden: bool = False
    extra: str = ""


class LoreBeat(BeatBase, tag="lore", frozen=True):
    key: str = ""


class SceneBeat(BeatBase, tag="scene", frozen=True):
    scene: str = ""
    scene_key: str = ""
    next_scene: str = ""
    after_script: str = ""


Beat = SayBeat | ChoiceBeat | BranchBeat | JumpBeat | MetaBeat | LoreBeat | SceneBeat


class Edge(msgspec.Struct, **BASE):
    source: str = ""
    target: str = ""
    kind: str = ""
    label: str = ""


class ScriptAnalysis(msgspec.Struct, rename="camel", omit_defaults=True):
    id: str = ""
    beats: list[Beat] = msgspec.field(default_factory=list)
    edges: list[Edge] = msgspec.field(default_factory=list)
    checks: dict[str, tuple[str, ...]] = msgspec.field(default_factory=dict)
    positions: tuple[str, ...] = ()
    lore_keys: tuple[str, ...] = ()
    unresolved_jumps: list[str] = msgspec.field(default_factory=list)
    time: int | None = None
    say_count: int = 0
    scene_count: int = 0
    error: str = ""
