import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

from ..vocab import (
    COND_CHECK,
    COND_COMPARE,
    COND_GROUP,
    COND_LOGIC,
    COND_VAR,
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

type NameTables = dict[str, dict[str, str]]


@dataclass(frozen=True)
class NameSpec:
    namespace: str
    prefix: str = ""
    key_prefix: str = ""
    use_segments: bool = False
    asset_digits: bool = False


NAME_SPECS: dict[str, NameSpec] = {
    VALUE_STAT: NameSpec("PlayerStat", key_prefix="Player_", use_segments=True),
    VALUE_REL: NameSpec("Character", key_prefix="Relationship_", use_segments=True),
    VALUE_FLAG: NameSpec("Flag", prefix="Name/"),
    VALUE_BOOK: NameSpec("Book", prefix="Name/", use_segments=True),
    VALUE_BOOK_LEVEL: NameSpec("Book", prefix="Name/", use_segments=True,
                               asset_digits=True),
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


def _candidate_keys(spec: NameSpec, asset_name: str, unity_id: str,
                    alias: str = "") -> list[str]:
    keys: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        if value and value not in seen:
            seen.add(value)
            keys.append(value)

    add(alias)
    values = [unity_id, asset_name]
    for value in values:
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


def _match(spec: NameSpec, asset_name: str, unity_id: str, alias: str,
           locale: Mapping[str, Any]) -> tuple[str, str]:
    table = locale.get(spec.namespace) or {}
    if not isinstance(table, dict):
        return "", ""
    for candidate in _candidate_keys(spec, asset_name, unity_id, alias):
        value = table.get(candidate)
        if value:
            canonical = (candidate[len(spec.prefix):]
                         if spec.prefix and candidate.startswith(spec.prefix) else candidate)
            return canonical, str(value)
    return "", ""


def _fallback_key(spec: NameSpec, asset_name: str, unity_id: str) -> str:
    if unity_id:
        return unity_id
    prefix = spec.key_prefix
    if prefix and asset_name.startswith(prefix):
        rest = asset_name[len(prefix):]
        head = _KEY_HEAD.match(rest)
        if head:
            rest = head.group(0)
        return rest.lower()
    return asset_name


def canonical_key_for(kind: str, asset_name: str, unity_id: str,
                      locale: Mapping[str, Any], alias: str = "") -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return unity_id or asset_name
    canonical, _display = _match(spec, asset_name, unity_id, alias, locale)
    return canonical or _fallback_key(spec, asset_name, unity_id)


def canonical_key(kind: str, asset_name: str, unity_id: str, locale: Mapping[str, Any],
                  name_registry: NameTables,
                  stat_notes: Mapping[str, str] | None = None) -> str:
    spec = NAME_SPECS.get(kind)
    if spec is None:
        return unity_id or asset_name
    alias = STAT_ALIASES.get(asset_name, "") if kind == VALUE_STAT else ""
    canonical, display = _match(spec, asset_name, unity_id, alias, locale)
    canonical = canonical or _fallback_key(spec, asset_name, unity_id)
    if not canonical:
        return ""
    bucket = name_registry.setdefault(kind, {})
    if canonical in bucket:
        return canonical
    if kind == VALUE_STAT:
        note = _stat_note(stat_notes, canonical) or _stat_note(stat_notes, unity_id or asset_name)
        if note:
            bucket[canonical] = note
            return canonical
    if display:
        bucket[canonical] = display
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


def record_check_display_name(key: str, locale: Mapping[str, Any],
                              name_registry: NameTables) -> None:
    if not key:
        return
    table = locale.get(CHECK_NAMESPACE) or {}
    if isinstance(table, dict) and table.get(key):
        name_registry.setdefault("check", {})[key] = str(table[key])


def _seed_group(node: Mapping[str, Any], name_registry: NameTables,
                locale: Mapping[str, Any]) -> None:
    if node.get("op") not in (None, "", "sum"):
        return
    items = node.get("items") or []
    if len(items) != 1:
        return
    child = items[0]
    if not isinstance(child, Mapping) or child.get("tag") != COND_VAR:
        return
    if child.get("kind") != VALUE_STAT:
        return
    name = node.get("name")
    if not isinstance(name, str) or not name.startswith(STAT_GROUP_PREFIX):
        return
    label = name[len(STAT_GROUP_PREFIX):].strip()
    if not label or "_" in label:
        return
    key = str(child.get("name") or "")
    unity_id = str(child.get("id") or "")
    alias = STAT_ALIASES.get(key, "")
    canonical = canonical_key_for(VALUE_STAT, key, unity_id, locale, alias) or unity_id or key
    if canonical:
        name_registry.setdefault(VALUE_STAT, {}).setdefault(canonical, label)


def _seed_expression(node: Any, name_registry: NameTables, locale: Mapping[str, Any]) -> None:
    if not isinstance(node, Mapping):
        return
    tag = node.get("tag")
    if tag == COND_GROUP:
        _seed_group(node, name_registry, locale)
        for item in node.get("items") or []:
            _seed_expression(item, name_registry, locale)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _seed_expression(node.get("left"), name_registry, locale)
        _seed_expression(node.get("right"), name_registry, locale)
        for item in node.get("items") or []:
            _seed_expression(item, name_registry, locale)


def _candidate_conditions(checkpoint: Mapping[str, Any]) -> list[Any]:
    out: list[Any] = []
    for candidate in checkpoint.get("candidates") or []:
        if not isinstance(candidate, Mapping):
            continue
        out.append(candidate.get("activeCondition"))
        for adjustment in candidate.get("adjustments") or []:
            if isinstance(adjustment, Mapping):
                out.append(adjustment.get("condition"))
    return out


def _seed_checkpoint(checkpoint: Mapping[str, Any], name_registry: NameTables,
                     locale: Mapping[str, Any]) -> None:
    for branch in checkpoint.get("branches") or []:
        if isinstance(branch, Mapping):
            _seed_expression(branch.get("expr"), name_registry, locale)
    for variant in checkpoint.get("variants") or []:
        if isinstance(variant, Mapping):
            _seed_checkpoint(variant, name_registry, locale)
    for item in checkpoint.get("countItems") or []:
        _seed_expression(item, name_registry, locale)
    for node in _candidate_conditions(checkpoint):
        _seed_expression(node, name_registry, locale)


def _walk_expression(node: Any, locale: Mapping[str, Any], name_registry: NameTables,
                     stat_notes: Mapping[str, str] | None = None) -> None:
    if not isinstance(node, dict):
        return
    tag = node.get("tag")
    if tag == COND_VAR:
        kind = str(node.get("kind") or "")
        key = str(node.get("name") or "")
        unity_id = str(node.get("id") or "")
        canonical = canonical_key(kind, key, unity_id, locale, name_registry, stat_notes)
        node["key"] = canonical
        node.pop("name", None)
        node.pop("id", None)
        return
    if tag == COND_CHECK:
        record_check_display_name(str(node.get("key") or ""), locale, name_registry)
        return
    if tag in (COND_COMPARE, COND_LOGIC):
        _walk_expression(node.get("left"), locale, name_registry, stat_notes)
        _walk_expression(node.get("right"), locale, name_registry, stat_notes)
        for item in node.get("items") or []:
            _walk_expression(item, locale, name_registry, stat_notes)
        return
    if tag == COND_GROUP:
        for item in node.get("items") or []:
            _walk_expression(item, locale, name_registry, stat_notes)


def _walk_checkpoint(checkpoint: dict[str, Any], locale: Mapping[str, Any],
                      name_registry: NameTables,
                      stat_notes: Mapping[str, str] | None = None) -> None:
    for branch in checkpoint.get("branches") or []:
        if isinstance(branch, dict):
            _walk_expression(branch.get("expr"), locale, name_registry, stat_notes)
    for addition in checkpoint.get("additions") or []:
        if not isinstance(addition, dict):
            continue
        kind = str(addition.get("kind") or "")
        key = str(addition.get("name") or "")
        unity_id = str(addition.get("id") or "")
        canonical = canonical_key(kind, key, unity_id, locale, name_registry, stat_notes)
        addition["key"] = canonical
        addition.pop("name", None)
        addition.pop("id", None)
    for variant in checkpoint.get("variants") or []:
        if isinstance(variant, dict):
            _walk_checkpoint(variant, locale, name_registry, stat_notes)
    for item in checkpoint.get("countItems") or []:
        if isinstance(item, dict):
            _walk_expression(item, locale, name_registry, stat_notes)
    for node in _candidate_conditions(checkpoint):
        _walk_expression(node, locale, name_registry, stat_notes)


def canonicalize_checkpoints(checkpoints: Mapping[str, dict[str, Any]],
                             locale: Mapping[str, Any], name_registry: NameTables,
                             stat_notes: Mapping[str, str] | None = None) -> None:
    for checkpoint in checkpoints.values():
        if isinstance(checkpoint, dict):
            _seed_checkpoint(checkpoint, name_registry, locale)
    for checkpoint in checkpoints.values():
        if isinstance(checkpoint, dict):
            _walk_checkpoint(checkpoint, locale, name_registry, stat_notes)


def _mission_states(missions: Mapping[str, dict[str, Any]]) -> Iterable[Mapping[str, Any]]:
    for record in missions.values():
        if not isinstance(record, Mapping):
            continue
        states = record.get("states")
        if not isinstance(states, Mapping):
            continue
        for state in states.values():
            if isinstance(state, Mapping):
                yield state


def canonicalize_missions(missions: Mapping[str, dict[str, Any]],
                          locale: Mapping[str, Any], name_registry: NameTables,
                          stat_notes: Mapping[str, str] | None = None) -> None:
    for state in _mission_states(missions):
        for item in state.get("conditions") or []:
            if not isinstance(item, Mapping):
                continue
            expr = item.get("expr")
            if isinstance(expr, dict):
                _seed_expression(expr, name_registry, locale)
    for state in _mission_states(missions):
        for item in state.get("conditions") or []:
            if not isinstance(item, Mapping):
                continue
            expr = item.get("expr")
            if isinstance(expr, dict):
                _walk_expression(expr, locale, name_registry, stat_notes)
        for field in ("modifyFlagsTrue", "modifyFlagsFalse"):
            for change in state.get(field) or []:
                if not isinstance(change, dict):
                    continue
                key = str(change.get("key") or "")
                if not key:
                    continue
                canonical = canonical_key(
                    VALUE_FLAG, key, "", locale, name_registry, stat_notes)
                if canonical:
                    change["key"] = canonical


def finalize_registry(tables: NameTables,
                      kinds: Iterable[str] | None = None) -> dict[str, dict[str, str]]:
    allowed = set(kinds) if kinds is not None else None
    out: dict[str, dict[str, str]] = {}
    for kind, table in tables.items():
        if allowed is not None and kind not in allowed:
            continue
        if table:
            out[kind] = {key: table[key] for key in sorted(table)}
    return out
