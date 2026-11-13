import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from ..schema import (
    BattleRow,
    BeatNode,
    BranchRow,
    CheckRef,
    ChoiceOption,
    ChoiceRow,
    EndingRow,
    JumpRow,
    LoreRow,
    MetaRow,
    OptionDetail,
    Requirement,
    RequirementItem,
    SayRow,
    SceneRow,
)
from ..script_model import (
    BranchBeat,
    ChoiceBeat,
    JumpBeat,
    LoreBeat,
    MetaBeat,
    SayBeat,
    SceneBeat,
)
from ..script_model import (
    CheckRef as CheckRefModel,
)
from ..vocab import (
    BATTLE_LIKE_SCENE_NAMES,
    DEATH_SCENE,
)
from . import labels
from .option_text import OptionView, decode_option
from .text_metrics import TEXT_KINDS, TextCounter

RICH_MARKUP = re.compile(r"\{[^{}]*\}")
MISSING_SAMPLE_LIMIT = 400
LORE_SAMPLE_LIMIT = 120
TITLE_PLACEHOLDERS = frozenset({"(title)", "{title}", "title", "（title）"})


@dataclass(frozen=True)
class RenderMetrics:
    options: int = 0
    locked: int = 0
    rich: int = 0
    think: int = 0
    think_named: int = 0
    lore: int = 0
    lore_fallback: int = 0
    lore_missing: int = 0
    lore_missing_samples: tuple[str, ...] = ()
    missing: int = 0
    battles: int = 0
    battle_missing: int = 0


@dataclass(frozen=True)
class LanguageRender:
    lang: str
    script_rows: dict[str, list[BeatNode]]
    word_counts: dict[str, list[list[int]]]
    chapter_counts: dict[str, list[list[int]]]
    characters: dict[str, str]
    titles: dict[str, str]
    edge_labels: dict[str, str]
    metrics: RenderMetrics
    missing: list[str]
    seconds: float


def check_to_schema(check: CheckRefModel | None) -> CheckRef | None:
    if check is None:
        return None
    return CheckRef(kind=check.kind, key=check.key, expected_result=check.expected_result)


def requirement_to_schema(requirement: Any) -> Requirement | None:
    if requirement is None:
        return None
    return Requirement(op=requirement.op, operand=requirement.operand)


def _requirement_items(view: OptionView) -> list[RequirementItem]:
    items: list[RequirementItem] = []
    for item in view.requirements:
        items.append(
            RequirementItem(
                kind=str(item.get("kind") or ""),
                op=str(item.get("op") or ""),
                value=item.get("value"),
            )
        )
    return items


class Renderer:
    def __init__(
        self,
        locale: dict[str, dict[str, str]],
        lore_fallback: dict[str, str] | None = None,
        registry: labels.NameRegistry | None = None,
        stat_notes: dict[str, str] | None = None,
        battles: Any = None,
        position_targets: Mapping[str, Sequence[str]] | None = None,
    ) -> None:
        self.counter = TextCounter()
        self.locale = locale
        self.battles = battles
        self.position_targets = position_targets or {}
        self.battle_count = 0
        self.battle_missing = 0
        self.registry = registry if registry is not None else labels.NameRegistry()
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

    def _ref(self, ref: Any) -> str:
        if ref is None:
            return ""
        if ref.is_locale_key:
            text = self._story_text(ref.text)
            return text if text is not None else ref.text
        text = self.story_table.get(ref.text)
        if text is not None:
            return text
        return ref.text

    def _option(self, ref: Any) -> OptionView:
        if ref.is_locale_key:
            return OptionView(self._ref(ref))
        return decode_option(ref.text, self.story_table)

    def _locked_label(self, ref: Any) -> str:
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

    def _ending(self, key: str) -> EndingRow | None:
        if not key:
            return None
        title = self.library.get(f"Title/{key}") or key
        desc = self.library.get(f"Desc/{key}") or ""
        self.registry.register(labels.NAME_ENDING, key, title)
        return EndingRow(key=key, title=title, desc=desc)

    def render_rows(self, beats: Sequence[object]) -> list[BeatNode]:
        out: list[BeatNode] = []
        for beat in beats:
            if isinstance(beat, SayBeat):
                out.append(self._say(beat))
            elif isinstance(beat, ChoiceBeat):
                out.append(self._choice(beat))
            elif isinstance(beat, BranchBeat):
                out.append(
                    BranchRow(
                        check=check_to_schema(beat.check),
                        condition=beat.cond,
                        source=beat.source,
                        rows=self.render_rows(beat.beats),
                        group=beat.group,
                    )
                )
            elif isinstance(beat, JumpBeat):
                out.append(self._jump(beat))
            elif isinstance(beat, MetaBeat):
                self._meta(beat, out)
            elif isinstance(beat, LoreBeat):
                self._legend(beat.key, out)
            elif isinstance(beat, SceneBeat):
                self._scene(beat, out)
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

    def _jump(self, beat: JumpBeat) -> JumpRow:
        if not beat.position:
            return JumpRow(target=beat.target or "", dynamic=beat.dynamic_source or "")
        targets = list(self.position_targets.get(beat.position, ()))
        target = targets[0] if len(targets) == 1 else ""
        return JumpRow(
            target=target,
            dynamic=beat.dynamic_source or "",
            position=beat.position,
            targets=targets,
        )

    def _say(self, beat: SayBeat) -> SayRow:
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
        return SayRow(
            speaker=speaker,
            text=text,
            mode=beat.mode,
            expression=beat.expression if speaker else "",
        )

    def _choice(self, beat: ChoiceBeat) -> ChoiceRow:
        options: list[ChoiceOption] = []
        for option in beat.options:
            view = self._option(option.ref)
            text = view.text
            if RICH_MARKUP.search(text):
                self.rich_count += 1
            self.option_count += 1
            self.counter.add_text("option", text)
            detail = None
            if view.action or view.requirements:
                detail = OptionDetail(action=view.action, requirements=_requirement_items(view))
            options.append(
                ChoiceOption(
                    text=text,
                    requirement=requirement_to_schema(view.requirement or option.requirement),
                    rows=self.render_rows(option.beats),
                    lock=self._locked_label(option.lock),
                    detail=detail,
                    condition=option.condition,
                )
            )
        return ChoiceRow(options=options)

    def _meta(self, beat: MetaBeat, out: list[BeatNode]) -> None:
        if beat.kind == "story":
            self._legend(beat.key, out)
            return
        if beat.kind == "time":
            out.append(MetaRow(kind=beat.kind, value=beat.value))
            return
        key = beat.key
        if beat.kind == "dice":
            labels.record_check_display_name(beat.key, self.locale, self.registry)
        elif beat.kind != "mission":
            value_kind = labels.META_VALUE_KIND.get(beat.kind, beat.kind)
            key = labels.canonical_key(
                value_kind, beat.key, "", self.locale, self.registry, self.stat_notes
            )
        if beat.kind == "setstat" and key in labels.STAT_VALUE_PREFIXES:
            self._stat_value(key, beat.value, out)
            return
        out.append(
            MetaRow(
                kind=beat.kind,
                key=key,
                value=beat.value,
                hidden=beat.hidden,
                extra=beat.extra,
            )
        )

    def _stat_value(self, stat: str, value: int | None, out: list[BeatNode]) -> None:
        name = labels.stat_value_name(self.locale, stat, value) if value is not None else ""
        if name:
            self.registry.register(stat, str(value), name)
        out.append(MetaRow(kind=f"set{stat}", key=stat, value=value))

    def _legend(self, key: str, out: list[BeatNode]) -> None:
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
        out.append(LoreRow(text=text))

    def _scene(self, beat: SceneBeat, out: list[BeatNode]) -> None:
        if beat.scene == DEATH_SCENE:
            ending = self._ending(beat.scene_key)
            if ending is not None:
                out.append(ending)
                return
        if beat.scene in BATTLE_LIKE_SCENE_NAMES and self.battles is not None:
            card = self.battles.card(beat.scene, beat.scene_key, beat.next_scene, beat.after_script)
            if card is not None:
                self.battle_count += 1
                for speaker in self._battle_speakers(card):
                    self.character_ids.add(speaker)
                out.append(
                    BattleRow(
                        scene=beat.scene,
                        scene_key=beat.scene_key,
                        next_scene=beat.next_scene,
                        card=card,
                        after_script=beat.after_script,
                    )
                )
                return
            self.battle_missing += 1
        out.append(
            SceneRow(
                scene=beat.scene,
                scene_key=beat.scene_key,
                next_scene=beat.next_scene,
                after_script=beat.after_script,
            )
        )

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

    def metrics(self) -> RenderMetrics:
        return RenderMetrics(
            options=self.option_count,
            locked=self.locked_count,
            rich=self.rich_count,
            think=self.think_count,
            think_named=self.think_named_count,
            lore=self.lore_count,
            lore_fallback=self.lore_fallback_count,
            lore_missing=self.lore_missing_count,
            lore_missing_samples=tuple(self.lore_missing[:40]),
            missing=self.missing_count,
            battles=self.battle_count,
            battle_missing=self.battle_missing,
        )
