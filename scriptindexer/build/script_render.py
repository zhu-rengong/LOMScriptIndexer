import re
from collections.abc import Mapping, Sequence
from typing import Any

from ..script_model import (
    BranchBeat,
    CheckRef,
    ChoiceBeat,
    JumpBeat,
    LoreBeat,
    MetaBeat,
    Requirement,
    SayBeat,
    SceneBeat,
    TextRef,
)
from ..vocab import (
    BATTLE_LIKE_SCENE_NAMES,
    BEAT_BATTLE,
    BEAT_BRANCH,
    BEAT_CHOICE,
    BEAT_ENDING,
    BEAT_JUMP,
    BEAT_LORE,
    BEAT_META,
    BEAT_SAY,
    BEAT_SCENE,
    DEATH_SCENE,
)
from . import labels
from .option_text import OptionView, decode_option
from .text_metrics import TEXT_KINDS, TextCounter

RICH_MARKUP = re.compile(r"\{[^{}]*\}")
MISSING_SAMPLE_LIMIT = 400
LORE_SAMPLE_LIMIT = 120
TITLE_PLACEHOLDERS = frozenset({"(title)", "{title}", "title", "（title）"})


def requirement_to_wire(requirement: Requirement | None) -> dict[str, Any] | None:
    if requirement is None:
        return None
    return {"op": requirement.op, "operand": requirement.operand}


def check_to_wire(check: CheckRef | None) -> dict[str, Any] | None:
    if check is None:
        return None
    payload: dict[str, Any] = {"kind": check.kind, "key": check.key}
    if check.expected_result is not None:
        payload["expectedResult"] = check.expected_result
    return payload


def condition_to_wire(node: dict[str, Any] | None) -> dict[str, Any] | None:
    if not node:
        return None
    tag = node.get("tag")
    if tag == "compare":
        left = condition_to_wire(node.get("left"))
        right = condition_to_wire(node.get("right"))
        if left is None or right is None:
            return None
        return {"tag": "compare", "op": node.get("op") or "", "left": left, "right": right}
    if tag == "logic":
        items = [condition_to_wire(item) for item in node.get("items") or []]
        if not items or any(item is None for item in items):
            return None
        return {"tag": "logic", "op": node.get("op") or "", "items": items}
    if tag in ("var", "check", "const"):
        return dict(node)
    return None


class Renderer:
    def __init__(self, locale: dict[str, dict[str, str]],
                 lore_fallback: dict[str, str] | None = None,
                 name_registry: labels.NameTables | None = None,
                 stat_notes: dict[str, str] | None = None,
                 battles: Any = None,
                 position_targets: Mapping[str, Sequence[str]] | None = None) -> None:
        self.counter = TextCounter()
        self.locale = locale
        self.battles = battles
        self.position_targets = position_targets or {}
        self.battle_count = 0
        self.battle_missing = 0
        self.name_registry = name_registry if name_registry is not None else {}
        self.stat_notes = stat_notes or {}
        self.lore_fallback = lore_fallback or {}
        self.story_table = locale.get("Story", {})
        self.characters = locale.get("Character", {})
        self.character_titles = locale.get("CharacterTitle", {})
        self.legend_info = locale.get("LegendInfo", {})
        self.library = locale.get("Library", {})
        self.missing: list[str] = []
        self.missing_count = 0
        self.option_count = 0
        self.locked_count = 0
        self.rich_count = 0
        self.think_count = 0
        self.think_named_count = 0
        self.lore_count = 0
        self.lore_fallback_count = 0
        self.lore_missing_count = 0
        self.lore_missing: list[str] = []
        self.character_ids: set[str] = set()

    def _story_text(self, key: str) -> str | None:
        text = self.story_table.get(key)
        if text is None:
            self.missing_count += 1
            if len(self.missing) < MISSING_SAMPLE_LIMIT:
                self.missing.append(key)
        return text

    def _ref(self, ref: TextRef | None) -> str:
        if ref is None:
            return ""
        if ref.is_locale_key:
            text = self._story_text(ref.text)
            return text if text is not None else ref.text
        text = self.story_table.get(ref.text)
        if text is not None:
            return text
        return ref.text

    def _option(self, ref: TextRef) -> OptionView:
        if ref.is_locale_key:
            return OptionView(self._ref(ref))
        return decode_option(ref.text, self.story_table)

    def _locked_label(self, ref: TextRef | None) -> str:
        if ref is None:
            return ""
        if ref.is_locale_key:
            text = self._story_text(ref.text) if ref.text in self.story_table else None
        else:
            text = self.story_table.get(ref.text)
        if not text or len(text.strip()) <= 1:
            return ""
        self.locked_count += 1
        return text

    def _ending(self, key: str) -> list[Any] | None:
        if not key:
            return None
        title = self.library.get(f"Title/{key}") or key
        desc = self.library.get(f"Desc/{key}") or ""
        self.name_registry.setdefault("ending", {})[key] = title
        return [BEAT_ENDING, key, title, desc]

    def render_rows(self, beats: Sequence[object]) -> list[list[Any]]:
        out: list[list[Any]] = []
        for beat in beats:
            if isinstance(beat, SayBeat):
                out.append(self._say(beat))
            elif isinstance(beat, ChoiceBeat):
                out.append(self._choice(beat))
            elif isinstance(beat, BranchBeat):
                out.append([
                    BEAT_BRANCH,
                    check_to_wire(beat.check),
                    beat.cond,
                    beat.source,
                    self.render_rows(beat.beats),
                    beat.group,
                ])
            elif isinstance(beat, JumpBeat):
                if beat.position:
                    out.append(self._position_jump(beat))
                    continue
                out.append([BEAT_JUMP, beat.target or "", beat.dynamic_source or ""])
            elif isinstance(beat, MetaBeat):
                if beat.kind == "story":
                    self._legend(beat.key, out)
                    continue
                if beat.kind == "time":
                    out.append([BEAT_META, beat.kind, "", beat.value])
                    continue
                key = beat.key
                if beat.kind == "dice":
                    labels.record_check_display_name(beat.key, self.locale, self.name_registry)
                elif beat.kind != "mission":
                    value_kind = labels.META_VALUE_KIND.get(beat.kind, beat.kind)
                    key = labels.canonical_key(
                        value_kind, beat.key, "", self.locale, self.name_registry, self.stat_notes)
                if beat.kind == "setstat" and key in labels.STAT_VALUE_PREFIXES:
                    self._stat_value(key, beat.value, out)
                    continue
                row: list[Any] = [BEAT_META, beat.kind, key, beat.value]
                if beat.hidden or beat.extra:
                    row.append(beat.hidden)
                if beat.extra:
                    row.append(beat.extra)
                out.append(row)
            elif isinstance(beat, LoreBeat):
                self._legend(beat.key, out)
            elif isinstance(beat, SceneBeat):
                if beat.scene == DEATH_SCENE:
                    ending = self._ending(beat.scene_key)
                    if ending is not None:
                        out.append(ending)
                        continue
                if beat.scene in BATTLE_LIKE_SCENE_NAMES and self.battles is not None:
                    card = self.battles.card(
                        beat.scene, beat.scene_key, beat.next_scene, beat.after_script)
                    if card is not None:
                        self.battle_count += 1
                        for speaker in self._battle_speakers(card):
                            self.character_ids.add(speaker)
                        out.append([BEAT_BATTLE, beat.scene, beat.scene_key, beat.next_scene,
                                    card, beat.after_script])
                        continue
                    self.battle_missing += 1
                out.append([BEAT_SCENE, beat.scene, beat.scene_key, beat.next_scene,
                            beat.after_script])
        return out

    @staticmethod
    def _battle_speakers(card: dict[str, Any]) -> set[str]:
        out: set[str] = set()
        speaker = card.get("speaker")
        if isinstance(speaker, str) and speaker:
            out.add(speaker)
        for event in card.get("events") or []:
            if not isinstance(event, dict):
                continue
            for line in event.get("lines") or []:
                if not isinstance(line, dict) or line.get("kind") != "say":
                    continue
                value = line.get("speaker")
                if isinstance(value, str) and value:
                    out.add(value)
        return out

    def _position_jump(self, beat: JumpBeat) -> list[Any]:
        targets = list(self.position_targets.get(beat.position, ()))
        target = targets[0] if len(targets) == 1 else ""
        return [BEAT_JUMP, target, beat.dynamic_source or "",
                {"position": beat.position, "targets": targets}]

    def _say(self, beat: SayBeat) -> list[Any]:
        speaker = beat.speaker or ""
        if speaker:
            self.character_ids.add(speaker)
        text = self._ref(beat.ref)
        if RICH_MARKUP.search(text):
            self.rich_count += 1
        if beat.mode == "think":
            self.think_count += 1
            if speaker:
                self.think_named_count += 1
        self.counter.add_text(beat.mode if beat.mode in TEXT_KINDS else "dialog", text)
        return [BEAT_SAY, speaker, text, beat.mode, beat.expression if speaker else ""]

    def _choice(self, beat: ChoiceBeat) -> list[Any]:
        options: list[list[Any]] = []
        for option in beat.options:
            view = self._option(option.ref)
            text = view.text
            if RICH_MARKUP.search(text):
                self.rich_count += 1
            self.option_count += 1
            self.counter.add_text("option", text)
            detail = None
            if view.action or view.requirements:
                detail = {
                    "action": view.action,
                    "requirements": [dict(item) for item in view.requirements],
                }
            options.append([
                text,
                requirement_to_wire(view.requirement or option.requirement),
                self.render_rows(option.beats),
                self._locked_label(option.lock),
                detail,
                condition_to_wire(option.condition),
            ])
        return [BEAT_CHOICE, options]

    def _stat_value(self, stat: str, value: int | None, out: list[list[Any]]) -> None:
        name = labels.stat_value_name(self.locale, stat, value) if value is not None else ""
        if name:
            self.name_registry.setdefault(stat, {})[str(value)] = name
        out.append([BEAT_META, f"set{stat}", stat, value])

    def _legend(self, key: str, out: list[list[Any]]) -> None:
        text = self.legend_info.get(key) or ""
        if not text:
            fallback = self.lore_fallback.get(key) or ""
            if fallback:
                text = fallback
                self.lore_fallback_count += 1
            else:
                self.lore_missing_count += 1
                if len(self.lore_missing) < LORE_SAMPLE_LIMIT:
                    self.lore_missing.append(key)
                return
        self.counter.add_text("lore", text)
        self.lore_count += 1
        out.append([BEAT_LORE, text])

    def edge_label(self, joined_labels: str) -> str:
        if not joined_labels:
            return ""
        pieces = [piece.strip() for piece in joined_labels.split(" / ")]
        out = []
        for piece in pieces:
            text = self.story_table.get(piece)
            out.append(text if text else piece)
        return " / ".join(out)

    def character_table(self) -> dict[str, str]:
        return {
            character_id: self.characters.get(character_id, character_id)
            for character_id in sorted(self.character_ids)
        }

    def title_table(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for character_id in sorted(self.character_ids):
            title = self.character_titles.get(character_id)
            if not title:
                continue
            if title.strip().lower() in TITLE_PLACEHOLDERS:
                continue
            out[character_id] = title
        return out
