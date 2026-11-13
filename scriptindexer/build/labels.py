import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..schema import (
    CheckCondition,
    CheckpointCondition,
    ConditionNode,
    GroupCondition,
    MissionDocument,
    VarCondition,
    children,
    walk_conditions,
)
from ..vocab import (
    VALUE_BOOK,
    VALUE_BOOK_LEVEL,
    VALUE_CHRONICLE,
    VALUE_FLAG,
    VALUE_MISC,
    VALUE_REL,
    VALUE_SPECIAL,
    VALUE_STAT,
    VALUE_TALENT,
)

_SEGMENT_SPLIT = re.compile(r"[^0-9A-Za-z]+")
_TOKEN_SPLIT = re.compile(r"[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|[0-9]+")
_KEY_HEAD = re.compile(r"[A-Za-z0-9]+")
_DIGIT_HEAD = re.compile(r"^[A-Za-z]+(\d+)")

CHECK_NAMESPACE = "DiceHeader"
PLAYER_INFO_NAMESPACE = "PlayerInfo"
STAT_VALUE_PREFIXES: dict[str, str] = {"title": "Title/", "lover": "Lover/"}
META_VALUE_KIND = {"library": VALUE_CHRONICLE, "setflag": VALUE_FLAG}
STAT_GROUP_PREFIX = "數值_"
STAT_ALIASES: dict[str, str] = {
    "ActionCount": "action",
    "Faction_Level": "faction",
}

NAME_ENDING = "ending"
NAME_CHECK = "check"
NAME_STAT = VALUE_STAT
NAME_MISSION = "mission"
NAME_MISSION_STATE = "missionState"
NAME_MISSION_DIALOG = "missionDialog"
NAME_MISSION_POSITION = "missionPosition"


class NameRegistry:
    def __init__(self) -> None:
        self._tables: dict[str, dict[str, str]] = {}

    def register(self, kind: str, key: str, display: str) -> None:
        if not kind or not key or not display:
            return
        self._tables.setdefault(kind, {}).setdefault(key, display)

    def lookup(self, kind: str, key: str) -> str:
        return self._tables.get(kind, {}).get(key, "")

    def table(self) -> dict[str, dict[str, str]]:
        return {
            kind: {key: table[key] for key in sorted(table)}
            for kind, table in sorted(self._tables.items())
            if table
        }


class NameSpec:
    __slots__ = ("namespace", "prefix", "key_prefix", "use_segments", "asset_digits")

    def __init__(
        self,
        namespace: str,
        prefix: str = "",
        key_prefix: str = "",
        use_segments: bool = False,
        asset_digits: bool = False,
    ) -> None:
        self.namespace = namespace
        self.prefix = prefix
        self.key_prefix = key_prefix
        self.use_segments = use_segments
        self.asset_digits = asset_digits


NAME_SPECS: dict[str, NameSpec] = {
    VALUE_STAT: NameSpec("PlayerStat", key_prefix="Player_", use_segments=True),
    VALUE_REL: NameSpec("Character", key_prefix="Relationship_", use_segments=True),
    VALUE_FLAG: NameSpec("Flag", prefix="Name/"),
    VALUE_BOOK: NameSpec("Book", prefix="Name/", use_segments=True),
    VALUE_BOOK_LEVEL: NameSpec("Book", prefix="Name/", use_segments=True, asset_digits=True),
    VALUE_MISC: NameSpec("Misc", prefix="Name/", use_segments=True),
    VALUE_SPECIAL: NameSpec("Special", prefix="Name/", use_segments=True),
    VALUE_TALENT: NameSpec("PlayerTalent", prefix="Name/", use_segments=True),
    VALUE_CHRONICLE: NameSpec("Library", prefix="Title/"),
}


def _segments(name: str) -> list[str]:
    segments: list[str] = []
    for chunk in _SEGMENT_SPLIT.split(name or ""):
        if not chunk:
            continue
        tokens: list[str] = []
        for token in _TOKEN_SPLIT.findall(chunk):
            if token.isdigit() and tokens:
                tokens[-1] += token
            else:
                tokens.append(token.lower())
        segments.extend(tokens)
    return segments


def _candidate_keys(spec: NameSpec, asset_name: str, unity_id: str, alias: str = "") -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            keys.append(value)

    add(alias)
    for value in (unity_id, asset_name):
        if not value:
            continue
        if spec.prefix and not value.startswith(spec.prefix):
            add(spec.prefix + value)
        add(value)
    if spec.use_segments and asset_name:
        segments = _segments(asset_name)
        for index in range(len(segments)):
            add(spec.prefix + "-".join(segments[index:]))
    if spec.asset_digits and asset_name:
        head = _DIGIT_HEAD.match(asset_name)
        if head:
            add(spec.prefix + head.group(1))
    return keys


def _stat_note(stat_notes: Mapping[str, str] | None, key: str) -> str:
    if not stat_notes:
        return ""
    note = stat_notes.get(key)
    return note.strip() if isinstance(note, str) else ""


def _match(
    spec: NameSpec, asset_name: str, unity_id: str, alias: str, locale: Mapping[str, Any]
) -> tuple[str, str]:
    table = locale.get(spec.namespace) or {}
    if not isinstance(table, dict):
        return "", ""
    for candidate in _candidate_keys(spec, asset_name, unity_id, alias):
        value = table.get(candidate)
        if value:
            canonical = (
                candidate[len(spec.prefix) :]
                if spec.prefix and candidate.startswith(spec.prefix)
                else candidate
            )
            return canonical, str(value)
    return "", ""


def _fallback_key(spec: NameSpec, asset_name: str, unity_id: str) -> str:
    if unity_id:
        return unity_id
    prefix = spec.key_prefix
    if prefix and asset_name.startswith(prefix):
        rest = asset_name[len(prefix) :]
        head = _KEY_HEAD.match(rest)
        if head:
            rest = head.group(0)
        return rest.lower()
    return asset_name


def canonical_key_for(
    kind: str, asset_name: str, unity_id: str, locale: Mapping[str, Any], alias: str = ""
) -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return unity_id or asset_name
    canonical, _display = _match(spec, asset_name, unity_id, alias, locale)
    return canonical or _fallback_key(spec, asset_name, unity_id)


def canonical_key(
    kind: str,
    asset_name: str,
    unity_id: str,
    locale: Mapping[str, Any],
    registry: NameRegistry,
    stat_notes: Mapping[str, str] | None = None,
) -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return unity_id or asset_name
    alias = STAT_ALIASES.get(asset_name, "") if kind == VALUE_STAT else ""
    canonical, display = _match(spec, asset_name, unity_id, alias, locale)
    canonical = canonical or _fallback_key(spec, asset_name, unity_id)
    if not canonical:
        return ""
    if registry.lookup(kind, canonical):
        return canonical
    if kind == VALUE_STAT:
        note = _stat_note(stat_notes, canonical) or _stat_note(stat_notes, unity_id or asset_name)
        if note:
            registry.register(kind, canonical, note)
            return canonical
    registry.register(kind, canonical, display)
    return canonical


def stat_value_name(locale: Mapping[str, Any], stat: str, value: int) -> str:
    prefix = STAT_VALUE_PREFIXES.get(stat)
    if not prefix:
        return ""
    table = locale.get(PLAYER_INFO_NAMESPACE) or {}
    if not isinstance(table, dict):
        return ""
    name = table.get(f"{prefix}{value}")
    return str(name) if name else ""


def record_check_display_name(key: str, locale: Mapping[str, Any], registry: NameRegistry) -> None:
    if not key:
        return
    table = locale.get(CHECK_NAMESPACE) or {}
    if isinstance(table, dict) and table.get(key):
        registry.register(NAME_CHECK, key, str(table[key]))


def _seed_group(node: GroupCondition, registry: NameRegistry, locale: Mapping[str, Any]) -> None:
    if node.op not in ("", "sum"):
        return
    if len(node.items) != 1:
        return
    child = node.items[0]
    if not isinstance(child, VarCondition) or child.kind != VALUE_STAT:
        return
    if not node.name.startswith(STAT_GROUP_PREFIX):
        return
    label = node.name[len(STAT_GROUP_PREFIX) :].strip()
    if not label or "_" in label:
        return
    alias = STAT_ALIASES.get(child.name, "")
    canonical = (
        canonical_key_for(VALUE_STAT, child.name, child.id, locale, alias) or child.id or child.name
    )
    if canonical:
        registry.register(VALUE_STAT, canonical, label)


def _seed_expression(
    node: ConditionNode | None, registry: NameRegistry, locale: Mapping[str, Any]
) -> None:
    if node is None:
        return
    if isinstance(node, GroupCondition):
        _seed_group(node, registry, locale)
    for child in children(node):
        _seed_expression(child, registry, locale)


def _canonicalize_expression(
    node: ConditionNode | None,
    locale: Mapping[str, Any],
    registry: NameRegistry,
    stat_notes: Mapping[str, str] | None = None,
) -> None:
    def on_var(item: VarCondition) -> None:
        canonical = canonical_key(item.kind, item.name, item.id, locale, registry, stat_notes)
        item.key = canonical
        item.name = ""
        item.id = ""

    def on_check(item: CheckCondition) -> None:
        record_check_display_name(item.key, locale, registry)

    walk_conditions(node, on_var, on_check)


def _candidate_expressions(checkpoint: CheckpointCondition) -> list[ConditionNode | None]:
    out: list[ConditionNode | None] = []
    for candidate in checkpoint.candidates:
        out.append(candidate.active_condition)
        for adjustment in candidate.adjustments:
            out.append(adjustment.condition)
    return out


def _seed_checkpoint(
    checkpoint: CheckpointCondition, registry: NameRegistry, locale: Mapping[str, Any]
) -> None:
    for branch in checkpoint.branches:
        _seed_expression(branch.expr, registry, locale)
    for variant in checkpoint.variants:
        _seed_checkpoint(variant, registry, locale)
    for node in _candidate_expressions(checkpoint):
        _seed_expression(node, registry, locale)


def _walk_checkpoint(
    checkpoint: CheckpointCondition,
    locale: Mapping[str, Any],
    registry: NameRegistry,
    stat_notes: Mapping[str, str] | None = None,
) -> None:
    for branch in checkpoint.branches:
        _canonicalize_expression(branch.expr, locale, registry, stat_notes)
    for addition in checkpoint.additions:
        addition.key = canonical_key(
            addition.kind, addition.name, addition.id, locale, registry, stat_notes
        )
        addition.name = ""
        addition.id = ""
    for variant in checkpoint.variants:
        _walk_checkpoint(variant, locale, registry, stat_notes)
    for node in _candidate_expressions(checkpoint):
        _canonicalize_expression(node, locale, registry, stat_notes)


def canonicalize_checkpoints(
    checkpoints: Mapping[str, CheckpointCondition],
    locale: Mapping[str, Any],
    registry: NameRegistry,
    stat_notes: Mapping[str, str] | None = None,
) -> None:
    for checkpoint in checkpoints.values():
        _seed_checkpoint(checkpoint, registry, locale)
    for checkpoint in checkpoints.values():
        _walk_checkpoint(checkpoint, locale, registry, stat_notes)


def canonicalize_missions(
    missions: MissionDocument,
    locale: Mapping[str, Any],
    registry: NameRegistry,
    stat_notes: Mapping[str, str] | None = None,
) -> None:
    states = [state for record in missions.items.values() for state in record.states.values()]
    for state in states:
        for item in state.conditions:
            _seed_expression(item.expr, registry, locale)
    for state in states:
        for item in state.conditions:
            _canonicalize_expression(item.expr, locale, registry, stat_notes)
        for change in (*state.modify_flags_true, *state.modify_flags_false):
            if not change.key:
                continue
            canonical = canonical_key(VALUE_FLAG, change.key, "", locale, registry, stat_notes)
            if canonical:
                change.key = canonical


def register_mission_names(
    missions: MissionDocument, locale: Mapping[str, Any], registry: NameRegistry
) -> None:
    raw_position = locale.get("Position")
    position_locale = raw_position if isinstance(raw_position, dict) else {}
    positions_done: set[str] = set()
    for mission_id, record in missions.items.items():
        registry.register(NAME_MISSION, mission_id, record.desc)
        for state_key, state in record.states.items():
            registry.register(NAME_MISSION_STATE, state_key, state.desc)
            code = state.position_code
            if code and code not in positions_done:
                text = position_locale.get(f"Name/{code}")
                if isinstance(text, str) and text:
                    registry.register(NAME_MISSION_POSITION, code, text)
                positions_done.add(code)
            for dialog in (*state.start_dialogs, *state.alert_dialogs):
                text = position_locale.get(f"Dialog/{dialog.key}")
                if isinstance(dialog.key, str) and dialog.key and isinstance(text, str) and text:
                    registry.register(NAME_MISSION_DIALOG, dialog.key, text)


def finalize_registry(
    registry: NameRegistry, kinds: Iterable[str] | None = None
) -> dict[str, dict[str, str]]:
    table = registry.table()
    if kinds is None:
        return table
    allowed = set(kinds)
    return {kind: values for kind, values in table.items() if kind in allowed}
