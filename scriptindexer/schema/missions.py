import msgspec

from .base import Wire
from .conditions import ConditionItem


class MissionTime(Wire):
    year: int = 0
    month: int = 0
    stage: int = 0
    day: int = 0


class MissionTimeRule(Wire):
    check: bool = False
    type: int = 0
    specific: MissionTime | None = None
    min: MissionTime | None = None
    max: MissionTime | None = None
    period: int = 0


class MissionDialog(Wire):
    portrait: str = ""
    key: str = ""


class FlagChange(Wire):
    key: str = ""
    value: int = 0
    note: str = ""


class MissionState(Wire):
    desc: str = ""
    active: bool = True
    position: int = 0
    position_code: str = ""
    before_main: bool = False
    start: str = ""
    next: str = ""
    time: MissionTimeRule = msgspec.field(default_factory=MissionTimeRule)
    conditions: list[ConditionItem] = msgspec.field(default_factory=list)
    start_dialogs: list[MissionDialog] = msgspec.field(default_factory=list)
    alert_dialogs: list[MissionDialog] = msgspec.field(default_factory=list)
    modify_flags_true: list[FlagChange] = msgspec.field(default_factory=list)
    modify_flags_false: list[FlagChange] = msgspec.field(default_factory=list)


class MissionRecord(Wire):
    desc: str = ""
    main: bool = False
    init: str = ""
    states: dict[str, MissionState] = msgspec.field(default_factory=dict)


class MissionDocument(Wire):
    schema: str = ""
    items: dict[str, MissionRecord] = msgspec.field(default_factory=dict)
