from typing import Any

import msgspec

from .base import Wire
from .conditions import ConditionNode


class BeatRow(msgspec.Struct, rename="camel", omit_defaults=True, tag_field="t"):
    pass


class Requirement(Wire):
    op: str = ""
    operand: str = ""


class CheckRef(Wire):
    kind: str = ""
    key: str = ""
    expected_result: int | None = None


class RequirementItem(Wire):
    kind: str = ""
    op: str = ""
    value: int | float | None = None


class OptionDetail(Wire):
    action: str = ""
    requirements: list[RequirementItem] = msgspec.field(default_factory=list)


class ChoiceOption(Wire):
    text: str = ""
    requirement: Requirement | None = None
    rows: list[BeatNode] = msgspec.field(default_factory=list)
    lock: str = ""
    detail: OptionDetail | None = None
    condition: ConditionNode | None = None


class SayRow(BeatRow, tag="say"):
    speaker: str = ""
    text: str = ""
    mode: str = ""
    expression: str = ""
    offstage: bool = False


class ChoiceRow(BeatRow, tag="choice"):
    options: list[ChoiceOption] = msgspec.field(default_factory=list)


class BranchRow(BeatRow, tag="branch"):
    check: CheckRef | None = None
    condition: ConditionNode | None = None
    source: str = ""
    rows: list[BeatNode] = msgspec.field(default_factory=list)
    group: int = 0


class JumpRow(BeatRow, tag="jump"):
    target: str = ""
    dynamic: str = ""
    position: str = ""
    targets: list[str] = msgspec.field(default_factory=list)


class MetaRow(BeatRow, tag="meta"):
    kind: str = ""
    key: str = ""
    value: int | None = None
    hidden: bool = False
    extra: str = ""


class LoreRow(BeatRow, tag="lore"):
    text: str = ""


class SceneRow(BeatRow, tag="scene"):
    scene: str = ""
    scene_key: str = ""
    next_scene: str = ""
    after_script: str = ""


class BattleRow(BeatRow, tag="battle"):
    scene: str = ""
    scene_key: str = ""
    next_scene: str = ""
    card: dict[str, Any] = msgspec.field(default_factory=dict)
    after_script: str = ""


class EndingRow(BeatRow, tag="ending"):
    key: str = ""
    title: str = ""
    desc: str = ""


BeatNode = (
    SayRow | ChoiceRow | BranchRow | JumpRow | MetaRow | LoreRow | SceneRow | BattleRow | EndingRow
)


def rows_of(row: BeatNode) -> list[BeatNode]:
    if isinstance(row, (ChoiceRow, BranchRow)):
        if isinstance(row, ChoiceRow):
            return [item for option in row.options for item in option.rows]
        return list(row.rows)
    return []
