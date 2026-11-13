import re
from collections.abc import Iterable, Mapping
from typing import Any

from ..script_model import BranchBeat, ChoiceBeat, SceneBeat
from ..vocab import BATTLE_LIKE_SCENE_NAMES, COMPARE_OP_SYMBOL, FACET_LIST_FIELDS
from . import labels

SIDE_NAMES = {1: "我方", 2: "敵方"}
ENTITY_NAMES = {0: "玩家", 1: "我方", 2: "敵方", 3: "中立"}
STAT_NAMES = {
    1: "體力",
    2: "內力",
    3: "輕功",
    4: "暗器",
    5: "拳掌",
    6: "刀劍",
    100: "嘴力",
    101: "抗毒",
    102: "抗麻",
    103: "毒藥",
    104: "麻痺",
    105: "心相",
    106: "儒學",
    107: "釋學",
    108: "道學",
    109: "形意",
    200: "防禦",
    201: "命中",
    202: "暗器命中",
    203: "迴避",
    204: "捅人格檔",
    205: "備揍格檔",
    206: "傷害減免",
    301: "暗器傷害",
    302: "嘴功傷害",
    303: "所有傷害",
    304: "額外暗器骰",
    305: "額外武器骰",
    306: "捅人傷害",
    307: "絕招傷害",
    401: "嘴攻機率",
    402: "捅人機率",
    403: "暗器機率",
    404: "備揍機率",
    405: "絕招機率",
    501: "命運",
}
ACTION_NAMES = {
    0: "無動作",
    1: "嘴砲",
    2: "捅人",
    3: "暗器",
    4: "備揍",
    5: "絕招",
    6: "絕招",
    7: "絕招",
}
RESULT_NAMES = {
    0: "正常",
    1: "自動攻擊",
    2: "無氣力",
    3: "無法動作",
    4: "行動失敗",
    5: "絕對先制攻擊",
}
WEAPON_NAMES = {1: "毒藥", 2: "麻痺"}
GENERIC_RESULT_FLAG = "C00000"
LOGIC_CODES = {0: "and", 1: "or"}
ASSET_ID = re.compile(r"^([A-Za-z]+\d+(?:_\d+)*)_")


def _side(value: Any) -> str:
    return SIDE_NAMES.get(value if isinstance(value, int) else 1, "我方")


def _entity(value: Any) -> str:
    return ENTITY_NAMES.get(value if isinstance(value, int) else 1, "我方")


def _stat(value: Any) -> str:
    return STAT_NAMES.get(value if isinstance(value, int) else 0, "數值")


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


def _part(text: str, kind: str = "", key: str = "") -> dict[str, str]:
    part = {"text": text}
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
        return "・".join(parts)

    def _effect_name(self, effect: Any) -> str:
        if not isinstance(effect, dict):
            return "狀態"
        key = _text(effect.get("key"))
        label = str(self.combat_skills.get(f"Name/{key}") or "") if key else ""
        label = label or self._asset_label(effect.get("name"))
        if not label or label == key:
            label = _text(effect.get("desc")) or key
        return label or "狀態"

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

    def _battle_title(self, entry: dict[str, Any]) -> str:
        name_key = entry.get("nameKey")
        if isinstance(name_key, str) and name_key:
            value = self.enemy_teams.get(name_key)
            if value:
                return str(value)
        forces = entry.get("forces") or {}
        enemy = forces.get("enemy") or {}
        teams = enemy.get("teams") or []
        names = [self._team_label(team) for team in teams]
        names = [name for name in names if name]
        if names:
            return "、".join(dict.fromkeys(names))
        return self._team_name(name_key) or "戰役"

    def _battle_card(self, entry: dict[str, Any]) -> dict[str, Any]:
        victory = entry.get("victory") or []
        rows: list[dict[str, str]] = []
        limit = _number(entry.get("limit"))
        goals: list[str] = []
        if "timeout" in victory:
            goals.append("人數不落後")
        if "defeat" in victory:
            goals.append("敵方全滅")
        if not goals:
            goals.append("擊敗敵方")
        for goal in goals:
            rows.append({"label": "目標", "value": goal})
        if "timeout" in victory and limit:
            rows.append({"label": "限時", "value": f"{limit} 秒"})
        forces = entry.get("forces") or {}
        for side, name in (("friend", "我方"), ("enemy", "敵方"), ("neutral", "中立")):
            payload = forces.get(side) or {}
            people = _number(payload.get("people"))
            if people:
                rows.append({"label": name, "value": f"{people} 人"})
            teams = self._named_teams(payload.get("teams"))
            if teams:
                rows.append({"label": f"{name}部隊", "value": "、".join(teams)})
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
        triggers: list[str] = []
        second = _number(event.get("second"), -1)
        if second >= 0:
            triggers.append(f"第 {second} 秒")
        count = event.get("count")
        if isinstance(count, dict):
            triggers.append(f"{_entity(count.get('side'))}≤ {_number(count.get('value'))} 人")
        condition = event.get("condition")
        gate = f"條件：{condition}" if isinstance(condition, str) and condition else ""
        if triggers and gate:
            return {"logic": "and", "parts": [_part(f"（{' 或 '.join(triggers)}）"), _part(gate)]}
        if triggers:
            return {
                "logic": "or" if len(triggers) > 1 else "and",
                "parts": [_part(trigger) for trigger in triggers],
            }
        if gate:
            return {"logic": "and", "parts": [_part(gate)]}
        return {"logic": "and", "parts": [_part("觸發")]}

    def _battle_action(self, action: Any) -> dict[str, Any] | None:
        if not isinstance(action, dict):
            return None
        kind = action.get("kind")
        if kind == "cinematic":
            return {
                "kind": "action",
                "text": "電影橫幅：開啟" if action.get("mode") == 0 else "電影橫幅：關閉",
            }
        if kind == "support":
            actor = action.get("actor")
            return {"kind": "action", "text": f"支援演出：{actor}" if actor else "支援演出"}
        if kind == "reinforcement":
            count = _number(action.get("count"), 1)
            return {"kind": "action", "text": f"{_entity(action.get('side'))}增援 {count} 人"}
        if kind == "result":
            return {
                "kind": "action",
                "text": "強制結算：我方勝利" if action.get("win") else "強制結算：敵方勝利",
            }
        text = action.get("text")
        return {"kind": "action", "text": text} if isinstance(text, str) and text else None

    def _combat_card(self, entry: dict[str, Any], next_scene: str, after: str) -> dict[str, Any]:
        enemy = entry.get("enemy") or {}
        ident = _text(enemy.get("id"))
        title = self._combat_name(ident) or "決鬥"
        goals: list[str] = ["擊敗對手"]
        if entry.get("deadEnd"):
            goals.append("落敗即死亡結局")
        goals.extend(self._flag_goals(entry.get("win"), "勝利"))
        goals.extend(self._flag_goals(entry.get("lose"), "失敗"))
        facts: list[str] = []
        hp = _number(enemy.get("hp"))
        if hp:
            facts.append(f"體力 {hp}")
        stamina = _number(enemy.get("stamina"))
        if stamina:
            facts.append(f"氣力 {stamina}")
        events: list[dict[str, Any]] = []
        payload = entry.get("events") or {}
        init = payload.get("init") or []
        if init:
            lines = self._action_lines(init, ident, next_scene, after)
            if lines:
                events.append({"when": {"logic": "and", "parts": [_part("開場")]}, "lines": lines})
        merged: dict[tuple[Any, ...], dict[str, Any]] = {}
        order: list[tuple[Any, ...]] = []
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
            signature = (
                when.get("logic"),
                tuple(
                    (part.get("text") or "", part.get("kind") or "", part.get("key") or "")
                    for part in when.get("parts") or []
                ),
            )
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

    def _flag_goals(self, flags: Any, prefix: str) -> list[str]:
        out: list[str] = []
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
            out.append(f"{prefix}：{label} = {_number(item.get('state'))}")
        return out

    def _rule_when(self, rule: dict[str, Any]) -> dict[str, Any]:
        parts = [
            part
            for part in (
                self._condition_part(condition) for condition in rule.get("conditions") or []
            )
            if part.get("text")
        ]
        if not parts:
            return {"logic": "and", "parts": [_part("事件")]}
        return {"logic": LOGIC_CODES.get(_number(rule.get("logic")), "and"), "parts": parts}

    def _condition_part(self, condition: Any) -> dict[str, str]:
        if not isinstance(condition, dict):
            return {}
        kind = condition.get("kind")
        if kind == "round":
            op = condition.get("op")
            value = _number(condition.get("value"))
            text = f"第 {value} 回合" if op == 0 else f"回合數 {_compare(op)} {value}"
            return {"text": text}
        if kind == "stat":
            text = (
                f"{_side(condition.get('side'))}{_stat(condition.get('stat'))}"
                f" {_compare(condition.get('op'))} {_number(condition.get('value'))}"
            )
            return {"text": text}
        if kind == "playerStat":
            return self._player_stat_part(condition)
        if kind == "flag":
            name = condition.get("flag")
            return _part(
                f"旗標「{self._flag_name(name)}」{_compare(condition.get('op'))}"
                f" {_number(condition.get('value'))}",
                "flag",
                self._flag_key(name),
            )
        if kind == "roundFlag":
            name = condition.get("flag")
            return _part(
                f"當前回合 {_compare(condition.get('op'))} 旗標「{self._flag_name(name)}」",
                "flag",
                self._flag_key(name),
            )
        if kind == "effectState":
            label = self._effect_name(condition.get("effect"))
            return {"text": f"{_side(condition.get('side'))}狀態「{label}」"}
        if kind == "actionResult":
            result = RESULT_NAMES.get(_number(condition.get("result")), "行動結果")
            return {"text": f"{_side(condition.get('side'))}行動結果：{result}"}
        if kind == "actionType":
            types = [_number(item) for item in condition.get("types") or []]
            names = (
                "、".join(dict.fromkeys(ACTION_NAMES.get(item, "行動") for item in types)) or "行動"
            )
            text = f"{_side(condition.get('side'))}行動：{names}"
            if condition.get("checkSuccess"):
                text += "成功" if condition.get("success") else "失敗"
            return {"text": text}
        if kind == "block":
            return {"text": f"{_side(condition.get('side'))}格擋反擊"}
        return {"text": _text(condition.get("text"))}

    def _player_stat_part(self, condition: dict[str, Any]) -> dict[str, str]:
        check = _number(condition.get("check"))
        raw = _text(condition.get("stat"))
        op = _compare(condition.get("op"))
        value = _number(condition.get("value"))
        if check == 2:
            return _part(f"{self._rel_name(raw)} {op} {value}", "rel", self._rel_key(raw))
        if check == 3:
            return _part(f"旗標「{self._flag_name(raw)}」{op} {value}", "flag", self._flag_key(raw))
        return _part(f"{self._player_stat(raw)} {op} {value}", "stat", self._stat_key(raw))

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
                    "text": f"旗標「{self._flag_name(name)}」= {_number(action.get('state'))}",
                }
            ]
        if kind == "stat":
            return [
                {
                    "kind": "action",
                    "text": f"{_side(action.get('side'))}{_stat(action.get('stat'))}"
                    f" {_signed(action.get('value'), action.get('unit'))}",
                }
            ]
        if kind == "weapon":
            name = WEAPON_NAMES.get(_number(action.get("stat")), "累積值")
            return [
                {
                    "kind": "action",
                    "text": f"{_side(action.get('side'))}{name}"
                    f" {_signed(action.get('value'), action.get('unit'))}",
                }
            ]
        if kind == "effect":
            verb = "移除狀態" if _number(action.get("mode"), 1) == 2 else "獲得狀態"
            label = self._effect_name(action.get("effect"))
            return [{"kind": "status", "text": f"{_side(action.get('side'))}{verb}「{label}」"}]
        if kind == "clearEffects":
            return [{"kind": "status", "text": f"{_side(action.get('side'))}移除所有狀態"}]
        if kind == "clearSupport":
            return [{"kind": "support", "text": f"{_side(action.get('side'))}移除所有支援"}]
        if kind == "support":
            support = self._asset_label(action.get("support"))
            return [
                {
                    "kind": "support",
                    "text": f"{_side(action.get('side'))}支援打擊"
                    + (f"「{support}」" if support else ""),
                }
            ]
        if kind == "vfx":
            return [{"kind": "action", "text": f"{_side(action.get('side'))}特效"}]
        if kind == "image":
            return [{"kind": "action", "text": "顯示畫面" if action.get("show") else "隱藏畫面"}]
        if kind == "scene":
            if _number(action.get("mode")) == 2:
                target = _text(action.get("scene"))
                return (
                    [{"kind": "scene", "scene": target}]
                    if target
                    else [{"kind": "action", "text": "切換場景"}]
                )
            if next_scene.lower() == "story" and after:
                return [{"kind": "after", "target": after}]
            if next_scene:
                return [{"kind": "scene", "scene": next_scene}]
            return [{"kind": "action", "text": "切換場景"}]
        if kind == "crazy":
            return [{"kind": "action", "text": f"{_side(action.get('side'))}自動行動"}]
        if kind == "flagRound":
            name = action.get("flag")
            return [
                {
                    "kind": "flag",
                    "key": self._flag_key(name),
                    "text": f"記錄回合：旗標「{self._flag_name(name)}」",
                }
            ]
        if kind == "reduceEffect":
            label = self._effect_name(action.get("effect"))
            return [
                {
                    "kind": "status",
                    "text": f"{_side(action.get('side'))}減少 {label}"
                    f" {_number(action.get('amount'))}",
                }
            ]
        if kind == "relationship":
            key = self._rel_key(action.get("key"))
            return [{"kind": "rel", "key": key, "text": f"{_side(action.get('side'))}好感度攻擊"}]
        text = action.get("text")
        return [{"kind": "action", "text": text}] if isinstance(text, str) and text else []

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


def collect_battle_facets(
    models: Mapping[str, Any], cards: BattleCards | None
) -> dict[str, dict[str, tuple[str, ...]]]:
    out: dict[str, dict[str, set[str]]] = {}
    if cards is None:
        return {}

    def walk(sid: str, beats: Any) -> None:
        for beat in beats:
            if isinstance(beat, SceneBeat):
                if beat.scene not in BATTLE_LIKE_SCENE_NAMES:
                    continue
                scene_facets = cards.facets_for_scene(beat.scene, beat.scene_key)
                if not scene_facets:
                    continue
                bucket = out.setdefault(sid, {field: set() for field in FACET_LIST_FIELDS})
                for field in FACET_LIST_FIELDS:
                    bucket[field].update(scene_facets.get(field) or ())
            elif isinstance(beat, BranchBeat):
                walk(sid, beat.beats)
            elif isinstance(beat, ChoiceBeat):
                for option in beat.options:
                    walk(sid, option.beats)

    for sid, model in models.items():
        walk(sid, model.beats)
    return {
        sid: {field: tuple(sorted(values)) for field, values in bucket.items()}
        for sid, bucket in out.items()
    }
