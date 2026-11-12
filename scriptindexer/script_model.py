from dataclasses import dataclass, field
from typing import Any

from .vocab import FACET_LIST_FIELDS


@dataclass(frozen=True)
class TextRef:
    text: str
    is_locale_key: bool = False


@dataclass(frozen=True)
class CharRef:
    id: str


@dataclass(frozen=True)
class CheckMark:
    kind: str
    key: str


@dataclass(frozen=True)
class Unevaluated:
    source: str


@dataclass(frozen=True)
class LockedOption:
    shown_text: Any
    locked_text: TextRef
    condition: dict[str, Any] | None = None


@dataclass(frozen=True)
class Requirement:
    op: str
    operand: str


@dataclass(frozen=True)
class CheckRef:
    kind: str
    key: str
    expected_result: int | None = None


@dataclass(frozen=True)
class SayBeat:
    speaker: str | None
    ref: TextRef
    mode: str
    expression: str = ""


@dataclass(frozen=True)
class ChoiceOption:
    ref: TextRef
    requirement: Requirement | None
    lock: TextRef | None
    beats: tuple[Beat, ...] = ()
    condition: dict[str, Any] | None = None


@dataclass(frozen=True)
class ChoiceBeat:
    options: tuple[ChoiceOption, ...]


@dataclass(frozen=True)
class BranchBeat:
    check: CheckRef | None
    cond: dict[str, Any] | None
    source: str
    beats: tuple[Beat, ...]
    group: int = 0


@dataclass(frozen=True)
class JumpBeat:
    target: str | None
    dynamic_source: str = ""
    position: str = ""


@dataclass(frozen=True)
class MetaBeat:
    kind: str
    key: str
    value: int | None = None
    hidden: bool = False


@dataclass(frozen=True)
class LoreBeat:
    key: str


@dataclass(frozen=True)
class SceneBeat:
    scene: str
    scene_key: str = ""
    next_scene: str = ""
    after_script: str = ""


Beat = SayBeat | ChoiceBeat | BranchBeat | JumpBeat | MetaBeat | LoreBeat | SceneBeat


@dataclass(frozen=True)
class Edge:
    source: str
    target: str
    kind: str
    label: str = ""

    def to_wire(self, index: int) -> dict[str, Any]:
        return {
            "index": index,
            "source": self.source,
            "target": self.target,
            "kind": self.kind,
            "label": self.label,
        }


@dataclass
class ScriptAnalysis:
    id: str
    beats: list[Beat] = field(default_factory=list)
    edges: list[Edge] = field(default_factory=list)
    checks: dict[str, tuple[str, ...]] = field(default_factory=dict)
    positions: tuple[str, ...] = ()
    lore_keys: tuple[str, ...] = ()
    unresolved_jumps: list[str] = field(default_factory=list)
    time: int | None = None
    say_count: int = 0
    scene_count: int = 0
    error: str = ""


@dataclass(frozen=True)
class Chapter:
    id: str
    kind: str
    number: int | None
    color: str
    script_count: int

    def to_wire(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": self.id,
            "kind": self.kind,
            "color": self.color,
            "scriptCount": self.script_count,
        }
        if self.number is not None:
            payload["number"] = self.number
        return payload


@dataclass(frozen=True)
class Facets:
    speakers: tuple[str, ...] = ()
    flags: tuple[str, ...] = ()
    checks: tuple[str, ...] = ()
    stats: tuple[str, ...] = ()
    relations: tuple[str, ...] = ()
    endings: tuple[str, ...] = ()
    option_count: int = 0
    lock_count: int = 0
    dice_check_count: int = 0

    def to_wire(self) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for name in FACET_LIST_FIELDS:
            values = getattr(self, name)
            if values:
                out[name] = list(values)
        if self.option_count:
            out["optionCount"] = self.option_count
        if self.lock_count:
            out["lockCount"] = self.lock_count
        if self.dice_check_count:
            out["diceCheckCount"] = self.dice_check_count
        return out


@dataclass(frozen=True)
class NodeFlags:
    is_empty: bool = False
    is_simplified_only: bool = False
    has_no_outgoing: bool = False
    has_no_incoming: bool = False

    def to_wire(self) -> dict[str, bool]:
        out: dict[str, bool] = {}
        if self.is_empty:
            out["isEmpty"] = True
        if self.is_simplified_only:
            out["isSimplifiedOnly"] = True
        if self.has_no_outgoing:
            out["hasNoOutgoing"] = True
        if self.has_no_incoming:
            out["hasNoIncoming"] = True
        return out


@dataclass(frozen=True)
class NodeRecord:
    id: str
    chapter_index: int
    out_degree: int
    in_degree: int
    say_count: int
    flags: NodeFlags
    facets: Facets
    time: int | None = None

    def to_wire(self) -> dict[str, Any]:
        node: dict[str, Any] = {
            "id": self.id,
            "chapterIndex": self.chapter_index,
            "outDegree": self.out_degree,
            "inDegree": self.in_degree,
            "sayCount": self.say_count,
        }
        flags = self.flags.to_wire()
        if flags:
            node["flags"] = flags
        facets = self.facets.to_wire()
        if facets:
            node["facets"] = facets
        if self.time is not None:
            node["time"] = self.time
        return node


@dataclass(frozen=True)
class GameInfo:
    version: str | None = None
    build: str | None = None
    updated: str | None = None

    def to_wire(self) -> dict[str, str | None]:
        return {"version": self.version, "build": self.build, "updated": self.updated}
