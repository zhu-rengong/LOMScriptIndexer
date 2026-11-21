import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..script_model import SceneBeat
from ..vocab import BATTLE_LIKE_SCENE_NAMES, COMPARE_OP_SYMBOL, FACET_LIST_FIELDS
from . import labels
from .visit import BeatWalker

SIDE_KEYS = {1: "battle.side.friend", 2: "battle.side.enemy"}
ENTITY_KEYS = {
    0: "battle.side.player",
    1: "battle.side.friend",
    2: "battle.side.enemy",
    3: "battle.side.neutral",
}
STAT_KEYS = {
    1: "battle.stat.hp",
    2: "battle.stat.inner",
    3: "battle.stat.qinggong",
    4: "battle.stat.hidden",
    5: "battle.stat.fist",
    6: "battle.stat.blade",
    100: "battle.stat.debate",
    101: "battle.stat.poisonResist",
    102: "battle.stat.numbResist",
    103: "battle.stat.poison",
    104: "battle.stat.numb",
    105: "battle.stat.mood",
    106: "battle.stat.confucianism",
    107: "battle.stat.buddhism",
    108: "battle.stat.daoism",
    109: "battle.stat.xingyi",
    200: "battle.stat.defence",
    201: "battle.stat.accuracy",
    202: "battle.stat.hiddenAccuracy",
    203: "battle.stat.evasion",
    204: "battle.stat.stabParry",
    205: "battle.stat.blockParry",
    206: "battle.stat.damageReduction",
    301: "battle.stat.hiddenDamage",
    302: "battle.stat.debateDamage",
    303: "battle.stat.allDamage",
    304: "battle.stat.extraHiddenDie",
    305: "battle.stat.extraWeaponDie",
    306: "battle.stat.stabDamage",
    307: "battle.stat.ultimateDamage",
    401: "battle.stat.debateChance",
    402: "battle.stat.stabChance",
    403: "battle.stat.hiddenChance",
    404: "battle.stat.blockChance",
    405: "battle.stat.ultimateChance",
    501: "battle.stat.fate",
}
ACTION_KEYS = {
    0: "battle.actionType.none",
    1: "battle.actionType.curse",
    2: "battle.actionType.stab",
    3: "battle.actionType.weapon",
    4: "battle.actionType.block",
    5: "battle.actionType.ultimate",
    6: "battle.actionType.ultimate",
    7: "battle.actionType.ultimate",
}
RESULT_KEYS = {
    0: "battle.result.normal",
    1: "battle.result.autoAttack",
    2: "battle.result.noStamina",
    3: "battle.result.cannotAct",
    4: "battle.result.failed",
    5: "battle.result.firstStrike",
}
WEAPON_KEYS = {1: "battle.weapon.poison", 2: "battle.weapon.numb"}
GENERIC_RESULT_FLAG = "C00000"
LOGIC_CODES = {0: "and", 1: "or"}
ASSET_ID = re.compile(r"^([A-Za-z]+\d+(?:_\d+)*)_")


def _key(text_key: str, joiner: str = "", **vars: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"textKey": text_key}
    values = {name: value for name, value in vars.items() if value is not None and value != ""}
    if values:
        out["vars"] = values
    if joiner:
        out["joiner"] = joiner
    return out


def _raw(text: str) -> dict[str, str]:
    return {"text": text}


def _side(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else 1
    return {"textKey": SIDE_KEYS.get(token, "battle.side.friend")}


def _entity(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else 1
    return {"textKey": ENTITY_KEYS.get(token, "battle.side.friend")}


def _stat(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else 0
    return {"textKey": STAT_KEYS.get(token, "battle.stat.unknown")}


def _action_type(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else 0
    return {"textKey": ACTION_KEYS.get(token, "battle.actionType.none")}


def _result(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else -1
    return {"textKey": RESULT_KEYS.get(token, "battle.result.unknown")}


def _weapon(value: Any) -> dict[str, Any]:
    token = value if isinstance(value, int) else 0
    return {"textKey": WEAPON_KEYS.get(token, "battle.weapon.stacks")}


def _compare(value: Any) -> str:
    return COMPARE_OP_SYMBOL.get(value if isinstance(value, int) else 0, "=")


def _signed(value: Any, unit: Any) -> str:
    number = value if isinstance(value, int) else 0
    text = f"{number:+d}"
    if unit == 2:
        text += "%"
    return text


def _number(value: Any, default: int = 0) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else default


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _part(payload: dict[str, Any], kind: str = "", key: str = "") -> dict[str, Any]:
    part = dict(payload)
    if kind and key:
        part["kind"] = kind
        part["key"] = key
    return part


def _asset_parts(name: str) -> tuple[str, list[str]]:
    match = ASSET_ID.match(name)
    if match is None:
        return "", [part for part in name.split("_") if part]
    return match.group(1), [part for part in name[match.end() :].split("_") if part]


class BattleCards:
    def __init__(
        self,
        items: dict[str, Any],
        locale: dict[str, Any],
        registry: labels.NameRegistry | None = None,
        stat_notes: Mapping[str, str] | None = None,
    ) -> None:
        self.items = items
        self.locale = locale
        self.registry = registry if registry is not None else labels.NameRegistry()
        self.stat_notes = stat_notes or {}
        self.enemy_teams = locale.get("EnemyTeam") or {}
        self.characters = locale.get("Character") or {}
        self.combat_names = locale.get("CombatCharacter") or {}
        self.combat_skills = locale.get("CombatSkill") or {}
        self.talking = locale.get("CombatTalking") or {}
        self.flags = locale.get("Flag") or {}
        self.player_stats = locale.get("PlayerStat") or {}
        self.missing = 0

    def card(
        self, battle_scene: str, scene_key: str, next_scene: str = "", after_script: str = ""
    ) -> dict[str, Any] | None:
        if battle_scene not in BATTLE_LIKE_SCENE_NAMES or not scene_key:
            return None
        entry = self.items.get(f"{battle_scene}:{scene_key}")
        if not isinstance(entry, dict):
            self.missing += 1
            return None
        try:
            if battle_scene == "Battle":
                return self._battle_card(entry)
            return self._combat_card(entry, next_scene, after_script)
        except Exception:
            self.missing += 1
            return None

    def facets_for_scene(self, battle_scene: str, scene_key: str) -> dict[str, tuple[str, ...]]:
        entry = self.items.get(f"{battle_scene}:{scene_key}") if scene_key else None
        if battle_scene != "Combat" or not isinstance(entry, dict):
            return {}
        speakers: set[str] = set()
        flags: set[str] = set()
        checks: set[str] = set()
        stats: set[str] = set()
        relations: set[str] = set()
        enemy = _text((entry.get("enemy") or {}).get("id"))
        if enemy:
            speakers.add(enemy)
        payload = entry.get("events") or {}
        for action in payload.get("init") or []:
            self._action_facts(action, enemy, speakers, flags, relations)
        for rule in payload.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            for condition in rule.get("conditions") or []:
                self._condition_facts(condition, stats, relations, checks)
            actions = list(rule.get("actions") or [])
            actions.extend(rule.get("after") or [])
            actions.extend(rule.get("result") or [])
            for action in actions:
                self._action_facts(action, enemy, speakers, flags, relations)
        return {
            "speakers": tuple(sorted(speakers)),
            "flags": tuple(sorted(flags)),
            "checks": tuple(sorted(checks)),
            "stats": tuple(sorted(stats)),
            "relations": tuple(sorted(relations)),
        }

    def _action_facts(
        self, action: Any, enemy: str, speakers: set[str], flags: set[str], relations: set[str]
    ) -> None:
        if not isinstance(action, dict):
            return
        kind = action.get("kind")
        if kind == "flag" or kind == "flagRound":
            key = self._flag_key(action.get("flag"))
            if key:
                flags.add(key)
            return
        if kind == "relationship":
            key = self._rel_key(action.get("key"))
            if key:
                relations.add(key)
            return
        if kind != "dialog":
            return
        for item in action.get("lines") or []:
            if not isinstance(item, dict):
                continue
            side = _number(item.get("side"), 1)
            if side in (1, 2):
                speakers.add("player")
            elif side in (3, 4):
                if enemy:
                    speakers.add(enemy)
            elif side in (5, 6, 7, 8) and _text(item.get("id")):
                speakers.add(_text(item.get("id")))

    def _condition_facts(
        self, condition: Any, stats: set[str], relations: set[str], checks: set[str]
    ) -> None:
        if not isinstance(condition, dict):
            return
        kind = condition.get("kind")
        if kind in ("flag", "roundFlag"):
            key = self._flag_key(condition.get("flag"))
            if key:
                checks.add(key)
            return
        if kind != "playerStat":
            return
        check = _number(condition.get("check"))
        raw = _text(condition.get("stat"))
        if check == 1:
            key = self._stat_key(raw)
            if key:
                stats.add(key)
        elif check == 2:
            key = self._rel_key(raw)
            if key:
                relations.add(key)
        elif check == 3:
            key = self._flag_key(raw)
            if key:
                checks.add(key)

    def _team_name(self, key: Any, note: Any = "", label: Any = "") -> str:
        if not isinstance(key, str) or not key:
            for value in (note, label):
                if isinstance(value, str) and value:
                    return value
            return ""
        value = self.enemy_teams.get(key)
        if value:
            return str(value)
        for fallback in (note, label):
            if isinstance(fallback, str) and fallback:
                return fallback
        return key

    def _team_label(self, team: Any) -> str:
        if isinstance(team, dict):
            return self._team_name(team.get("id"), team.get("note"), team.get("label"))
        return self._team_name(team)

    def _named_teams(self, teams: Any) -> list[str]:
        names: list[str] = []
        for team in teams or []:
            if not isinstance(team, dict):
                continue
            ident = _text(team.get("id"))
            if not ident or ident == "000":
                continue
            label = self._team_label(team)
            if not label or label == ident:
                continue
            names.append(label)
        return list(dict.fromkeys(names))

    def _combat_name(self, ident: Any) -> str:
        if not isinstance(ident, str) or not ident:
            return ""
        return str(self.combat_names.get(f"Name/{ident}") or self.characters.get(ident) or ident)

    def _flag_name(self, name: Any) -> str:
        if not isinstance(name, str) or not name:
            return ""
        return str(self.flags.get(f"Name/{name}") or name)

    def _asset_label(self, name: Any) -> str:
        if not isinstance(name, str) or not name:
            return ""
        ident, parts = _asset_parts(name)
        value = self.combat_skills.get(f"Name/{ident}") if ident else ""
        if value:
            return str(value)
        while len(parts) > 1 and parts[-1].isdigit():
            parts.pop()
        return " ".join(parts)

    def _effect_name(self, effect: Any) -> dict[str, Any]:
        if not isinstance(effect, dict):
            return _key("battle.status.unknown")
        key = _text(effect.get("key"))
        label = str(self.combat_skills.get(f"Name/{key}") or "") if key else ""
        label = label or self._asset_label(effect.get("name"))
        if not label or label == key:
            label = _text(effect.get("desc")) or key
        return _raw(label) if label else _key("battle.status.unknown")

    def _flag_key(self, name: Any) -> str:
        if not isinstance(name, str) or not name:
            return ""
        return labels.canonical_key("flag", name, name, self.locale, self.registry)

    def _stat_key(self, asset: Any) -> str:
        if not isinstance(asset, str) or not asset:
            return ""
        key = asset[len("Player_") :].lower() if asset.startswith("Player_") else asset
        return labels.canonical_key("stat", key, key, self.locale, self.registry, self.stat_notes)

    def _rel_key(self, asset: Any) -> str:
        if not isinstance(asset, str) or not asset:
            return ""
        return labels.canonical_key("rel", asset, asset, self.locale, self.registry)

    def _rel_name(self, asset: Any) -> str:
        key = self._rel_key(asset)
        if not key:
            return ""
        return str(self.characters.get(key) or key)

    def _player_stat(self, name: Any) -> str:
        if not isinstance(name, str) or not name:
            return ""
        key = name[len("Player_") :].lower() if name.startswith("Player_") else name
        return str(self.player_stats.get(key) or name)

    def _talking_text(self, key: Any, fallback: Any) -> str:
        if isinstance(key, str) and key:
            text = self.talking.get(key)
            if isinstance(text, str) and text:
                return text
        return fallback if isinstance(fallback, str) else ""

    def _battle_title(self, entry: dict[str, Any]) -> dict[str, Any]:
        name_key = entry.get("nameKey")
        if isinstance(name_key, str) and name_key:
            value = self.enemy_teams.get(name_key)
            if value:
                return _raw(str(value))
        forces = entry.get("forces") or {}
        enemy = forces.get("enemy") or {}
        teams = enemy.get("teams") or []
        names = [self._team_label(team) for team in teams]
        names = [name for name in names if name]
        if names:
            return _key("battle.list", items=[_raw(name) for name in dict.fromkeys(names)])
        fallback = self._team_name(name_key)
        return _raw(fallback) if fallback else _key("battle.title.campaign")

    def _battle_card(self, entry: dict[str, Any]) -> dict[str, Any]:
        victory = entry.get("victory") or []
        rows: list[dict[str, Any]] = []
        limit = _number(entry.get("limit"))
        goals: list[dict[str, Any]] = []
        if "timeout" in victory:
            goals.append(_key("battle.goal.noFewer"))
        if "defeat" in victory:
            goals.append(_key("battle.goal.wipeEnemy"))
        if not goals:
            goals.append(_key("battle.goal.defeatEnemy"))
        for goal in goals:
            rows.append({"label": _key("battle.row.goal"), "value": goal})
        if "timeout" in victory and limit:
            rows.append(
                {"label": _key("battle.row.limit"), "value": _key("battle.value.seconds", n=limit)}
            )
        forces = entry.get("forces") or {}
        sides = (
            ("friend", "battle.side.friend", "battle.row.friendTeams"),
            ("enemy", "battle.side.enemy", "battle.row.enemyTeams"),
            ("neutral", "battle.side.neutral", "battle.row.neutralTeams"),
        )
        for side, label_key, teams_key in sides:
            payload = forces.get(side) or {}
            people = _number(payload.get("people"))
            if people:
                rows.append(
                    {"label": _key(label_key), "value": _key("battle.value.people", n=people)}
                )
            teams = self._named_teams(payload.get("teams"))
            if teams:
                rows.append(
                    {
                        "label": _key(teams_key),
                        "value": _key("battle.list", items=[_raw(team) for team in teams]),
                    }
                )
        events: list[dict[str, Any]] = []
        for event in entry.get("events") or []:
            if not isinstance(event, dict):
                continue
            lines = [self._battle_action(action) for action in event.get("actions") or []]
            lines = [line for line in lines if line]
            if lines:
                events.append({"when": self._battle_when(event), "lines": lines})
        card: dict[str, Any] = {
            "kind": "battle",
            "title": self._battle_title(entry),
            "rows": rows,
            "events": events,
        }
        note = entry.get("note")
        if isinstance(note, str) and note:
            card["note"] = note
        return card

    def _battle_when(self, event: dict[str, Any]) -> dict[str, Any]:
        triggers: list[dict[str, Any]] = []
        second = _number(event.get("second"), -1)
        if second >= 0:
            triggers.append(_key("battle.trigger.second", n=second))
        count = event.get("count")
        if isinstance(count, dict):
            triggers.append(
                _key(
                    "battle.trigger.count",
                    side=_entity(count.get("side")),
                    n=_number(count.get("value")),
                )
            )
        condition = event.get("condition")
        gate: dict[str, Any] = {}
        if isinstance(condition, str) and condition:
            gate = _key("battle.trigger.condition", text=condition)
        if triggers and gate:
            return {
                "logic": "and",
                "parts": [
                    _part(_key("battle.trigger.anyOf", joiner="cxOr", items=triggers)),
                    _part(gate),
                ],
            }
        if triggers:
            return {
                "logic": "or" if len(triggers) > 1 else "and",
                "parts": [_part(trigger) for trigger in triggers],
            }
        if gate:
            return {"logic": "and", "parts": [_part(gate)]}
        return {"logic": "and", "parts": [_part(_key("battle.trigger.any"))]}

    def _battle_action(self, action: Any) -> dict[str, Any] | None:
        if not isinstance(action, dict):
            return None
        kind = action.get("kind")
        if kind == "cinematic":
            text_key = (
                "battle.action.cinematicOn"
                if action.get("mode") == 0
                else "battle.action.cinematicOff"
            )
            return {"kind": "action", **_key(text_key)}
        if kind == "support":
            actor = action.get("actor")
            payload = (
                _key("battle.action.supportActor", actor=actor)
                if actor
                else _key("battle.action.support")
            )
            return {"kind": "action", **payload}
        if kind == "reinforcement":
            count = _number(action.get("count"), 1)
            return {
                "kind": "action",
                **_key("battle.action.reinforce", side=_entity(action.get("side")), n=count),
            }
        if kind == "result":
            text_key = (
                "battle.action.forcedWin" if action.get("win") else "battle.action.forcedLose"
            )
            return {"kind": "action", **_key(text_key)}
        text = action.get("text")
        return {"kind": "action", **_raw(text)} if isinstance(text, str) and text else None

    def _combat_card(self, entry: dict[str, Any], next_scene: str, after: str) -> dict[str, Any]:
        enemy = entry.get("enemy") or {}
        ident = _text(enemy.get("id"))
        name = self._combat_name(ident)
        title = _raw(name) if name else _key("battle.title.duel")
        goals: list[dict[str, Any]] = [_key("battle.goal.defeatOpponent")]
        if entry.get("deadEnd"):
            goals.append(_key("battle.goal.deathOnLoss"))
        goals.extend(self._flag_goals(entry.get("win"), "battle.goal.winFlag"))
        goals.extend(self._flag_goals(entry.get("lose"), "battle.goal.loseFlag"))
        facts: list[dict[str, Any]] = []
        hp = _number(enemy.get("hp"))
        if hp:
            facts.append(_key("battle.fact.hp", n=hp))
        stamina = _number(enemy.get("stamina"))
        if stamina:
            facts.append(_key("battle.fact.stamina", n=stamina))
        events: list[dict[str, Any]] = []
        payload = entry.get("events") or {}
        init = payload.get("init") or []
        if init:
            lines = self._action_lines(init, ident, next_scene, after)
            if lines:
                events.append(
                    {
                        "when": {"logic": "and", "parts": [_part(_key("battle.trigger.opening"))]},
                        "lines": lines,
                    }
                )
        merged: dict[str, dict[str, Any]] = {}
        order: list[str] = []
        for rule in payload.get("rules") or []:
            if not isinstance(rule, dict):
                continue
            actions = list(rule.get("actions") or [])
            actions.extend(rule.get("after") or [])
            actions.extend(rule.get("result") or [])
            lines = self._action_lines(actions, ident, next_scene, after)
            if not lines:
                continue
            when = self._rule_when(rule)
            signature = repr(when)
            group = merged.get(signature)
            if group is None:
                group = {"when": when, "lines": []}
                merged[signature] = group
                order.append(signature)
            group["lines"].extend(lines)
        events.extend(merged[signature] for signature in order)
        card: dict[str, Any] = {
            "kind": "combat",
            "title": title,
            "goals": goals,
            "facts": facts,
            "events": events,
        }
        if ident:
            card["speaker"] = ident
        note = entry.get("desc") or enemy.get("note")
        if isinstance(note, str) and note:
            card["note"] = note
        return card

    def _flag_goals(self, flags: Any, text_key: str) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        if not isinstance(flags, list):
            return out
        for item in flags:
            if not isinstance(item, dict):
                continue
            name = item.get("flag")
            if not isinstance(name, str) or not name or name == GENERIC_RESULT_FLAG:
                continue
            label = self.flags.get(f"Name/{name}")
            if not label:
                continue
            out.append(_key(text_key, name=_raw(str(label)), n=_number(item.get("state"))))
        return out

    def _rule_when(self, rule: dict[str, Any]) -> dict[str, Any]:
        parts = [
            part
            for part in (
                self._condition_part(condition) for condition in rule.get("conditions") or []
            )
            if part
        ]
        if not parts:
            return {"logic": "and", "parts": [_part(_key("battle.trigger.event"))]}
        return {"logic": LOGIC_CODES.get(_number(rule.get("logic")), "and"), "parts": parts}

    def _condition_part(self, condition: Any) -> dict[str, Any]:
        if not isinstance(condition, dict):
            return {}
        kind = condition.get("kind")
        if kind == "round":
            op = condition.get("op")
            value = _number(condition.get("value"))
            if op == 0:
                return _part(_key("battle.trigger.round", n=value))
            return _part(_key("battle.trigger.roundCompare", op=_compare(op), n=value))
        if kind == "stat":
            return _part(
                _key(
                    "battle.trigger.stat",
                    side=_side(condition.get("side")),
                    stat=_stat(condition.get("stat")),
                    op=_compare(condition.get("op")),
                    n=_number(condition.get("value")),
                )
            )
        if kind == "playerStat":
            return self._player_stat_part(condition)
        if kind == "flag":
            name = condition.get("flag")
            return _part(
                _key(
                    "battle.trigger.flag",
                    name=_raw(self._flag_name(name)),
                    op=_compare(condition.get("op")),
                    n=_number(condition.get("value")),
                ),
                "flag",
                self._flag_key(name),
            )
        if kind == "roundFlag":
            name = condition.get("flag")
            return _part(
                _key(
                    "battle.trigger.roundFlag",
                    op=_compare(condition.get("op")),
                    name=_raw(self._flag_name(name)),
                ),
                "flag",
                self._flag_key(name),
            )
        if kind == "effectState":
            return _part(
                _key(
                    "battle.trigger.effect",
                    side=_side(condition.get("side")),
                    name=self._effect_name(condition.get("effect")),
                )
            )
        if kind == "actionResult":
            return _part(
                _key(
                    "battle.trigger.actionResult",
                    side=_side(condition.get("side")),
                    result=_result(condition.get("result")),
                )
            )
        if kind == "actionType":
            types = [_number(item) for item in condition.get("types") or []]
            names = [_action_type(item) for item in types]
            unique = {item["textKey"]: item for item in names}
            key = "battle.trigger.actionType"
            vars: dict[str, Any] = {
                "side": _side(condition.get("side")),
                "types": _key("battle.list", items=list(unique.values())),
            }
            if condition.get("checkSuccess"):
                key = "battle.trigger.actionTypeCheck"
                ok = bool(condition.get("success"))
                vars["outcome"] = _key("battle.outcome.success" if ok else "battle.outcome.failure")
            return _part(_key(key, **vars))
        if kind == "block":
            return _part(_key("battle.trigger.block", side=_side(condition.get("side"))))
        text = _text(condition.get("text"))
        return _part(_raw(text)) if text else {}

    def _player_stat_part(self, condition: dict[str, Any]) -> dict[str, Any]:
        check = _number(condition.get("check"))
        raw = _text(condition.get("stat"))
        op = _compare(condition.get("op"))
        value = _number(condition.get("value"))
        if check == 2:
            return _part(
                _key("battle.trigger.compare", name=_raw(self._rel_name(raw)), op=op, n=value),
                "rel",
                self._rel_key(raw),
            )
        if check == 3:
            return _part(
                _key("battle.trigger.flag", name=_raw(self._flag_name(raw)), op=op, n=value),
                "flag",
                self._flag_key(raw),
            )
        return _part(
            _key("battle.trigger.compare", name=_raw(self._player_stat(raw)), op=op, n=value),
            "stat",
            self._stat_key(raw),
        )

    def _action_lines(
        self, actions: Iterable[Any], enemy: str, next_scene: str, after: str
    ) -> list[dict[str, Any]]:
        lines: list[dict[str, Any]] = []
        for action in actions:
            lines.extend(self._action_line(action, enemy, next_scene, after))
        return lines

    def _action_line(
        self, action: Any, enemy: str, next_scene: str, after: str
    ) -> list[dict[str, Any]]:
        if not isinstance(action, dict):
            return []
        kind = action.get("kind")
        if kind == "dialog":
            return self._dialog_lines(action, enemy)
        if kind == "script":
            name = action.get("name")
            return [{"kind": "jump", "target": name}] if isinstance(name, str) and name else []
        if kind == "flag":
            name = action.get("flag")
            return [
                {
                    "kind": "flag",
                    "key": self._flag_key(name),
                    **_key(
                        "battle.action.flagSet",
                        name=_raw(self._flag_name(name)),
                        n=_number(action.get("state")),
                    ),
                }
            ]
        if kind == "stat":
            return [
                {
                    "kind": "action",
                    **_key(
                        "battle.action.stat",
                        side=_side(action.get("side")),
                        stat=_stat(action.get("stat")),
                        delta=_signed(action.get("value"), action.get("unit")),
                    ),
                }
            ]
        if kind == "weapon":
            return [
                {
                    "kind": "action",
                    **_key(
                        "battle.action.weapon",
                        side=_side(action.get("side")),
                        name=_weapon(action.get("stat")),
                        delta=_signed(action.get("value"), action.get("unit")),
                    ),
                }
            ]
        if kind == "effect":
            key = (
                "battle.action.effectRemove"
                if _number(action.get("mode"), 1) == 2
                else "battle.action.effectAdd"
            )
            return [
                {
                    "kind": "status",
                    **_key(
                        key,
                        side=_side(action.get("side")),
                        name=self._effect_name(action.get("effect")),
                    ),
                }
            ]
        if kind == "clearEffects":
            return [
                {
                    "kind": "status",
                    **_key("battle.action.clearEffects", side=_side(action.get("side"))),
                }
            ]
        if kind == "clearSupport":
            return [
                {
                    "kind": "support",
                    **_key("battle.action.clearSupport", side=_side(action.get("side"))),
                }
            ]
        if kind == "support":
            label = self._asset_label(action.get("support"))
            key = "battle.action.supportStrikeNamed" if label else "battle.action.supportStrike"
            return [
                {
                    "kind": "support",
                    **_key(key, side=_side(action.get("side")), name=_raw(label)),
                }
            ]
        if kind == "vfx":
            return [{"kind": "action", **_key("battle.action.vfx", side=_side(action.get("side")))}]
        if kind == "image":
            key = "battle.action.imageShow" if action.get("show") else "battle.action.imageHide"
            return [{"kind": "action", **_key(key)}]
        if kind == "scene":
            if _number(action.get("mode")) == 2:
                target = _text(action.get("scene"))
                return (
                    [{"kind": "scene", "scene": target}]
                    if target
                    else [{"kind": "action", **_key("battle.action.sceneSwitch")}]
                )
            if next_scene.lower() == "story" and after:
                return [{"kind": "after", "target": after}]
            if next_scene:
                return [{"kind": "scene", "scene": next_scene}]
            return [{"kind": "action", **_key("battle.action.sceneSwitch")}]
        if kind == "crazy":
            return [
                {"kind": "action", **_key("battle.action.auto", side=_side(action.get("side")))}
            ]
        if kind == "flagRound":
            name = action.get("flag")
            return [
                {
                    "kind": "flag",
                    "key": self._flag_key(name),
                    **_key("battle.action.roundFlag", name=_raw(self._flag_name(name))),
                }
            ]
        if kind == "reduceEffect":
            return [
                {
                    "kind": "status",
                    **_key(
                        "battle.action.reduceEffect",
                        side=_side(action.get("side")),
                        name=self._effect_name(action.get("effect")),
                        n=_number(action.get("amount")),
                    ),
                }
            ]
        if kind == "relationship":
            key = self._rel_key(action.get("key"))
            return [
                {
                    "kind": "rel",
                    "key": key,
                    **_key("battle.action.relAttack", side=_side(action.get("side"))),
                }
            ]
        text = action.get("text")
        return [{"kind": "action", **_raw(text)}] if isinstance(text, str) and text else []

    def _dialog_lines(self, action: dict[str, Any], enemy: str) -> list[dict[str, Any]]:
        lines: list[dict[str, Any]] = []
        for item in action.get("lines") or []:
            if not isinstance(item, dict):
                continue
            side = _number(item.get("side"), 1)
            text = self._talking_text(item.get("key"), item.get("text"))
            if not text:
                continue
            if side == 9:
                lines.append({"kind": "say", "speaker": "", "mode": "narration", "text": text})
                continue
            if side in (1, 2):
                speaker = "player"
            elif side in (3, 4):
                speaker = enemy
            else:
                speaker = _text(item.get("id"))
            think = side in (2, 4, 6, 8)
            lines.append(
                {
                    "kind": "say",
                    "speaker": speaker,
                    "mode": "think" if think else "dialog",
                    "text": text,
                }
            )
        return lines


class _BattleFacetWalker(BeatWalker):
    def __init__(self, cards: BattleCards) -> None:
        self.cards = cards
        self.bucket: dict[str, set[str]] = {field: set() for field in FACET_LIST_FIELDS}

    def scene(self, beat: SceneBeat) -> None:
        if beat.scene not in BATTLE_LIKE_SCENE_NAMES:
            return
        scene_facets = self.cards.facets_for_scene(beat.scene, beat.scene_key)
        if not scene_facets:
            return
        for field in FACET_LIST_FIELDS:
            self.bucket[field].update(scene_facets.get(field) or ())


def collect_battle_facets(
    models: Mapping[str, Any], cards: BattleCards | None
) -> dict[str, dict[str, tuple[str, ...]]]:
    if cards is None:
        return {}
    out: dict[str, dict[str, tuple[str, ...]]] = {}
    for sid, model in models.items():
        walker = _BattleFacetWalker(cards)
        walker.walk(model.beats)
        if any(walker.bucket.values()):
            out[sid] = {field: tuple(sorted(values)) for field, values in walker.bucket.items()}
    return out
