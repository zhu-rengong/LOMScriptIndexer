from collections.abc import Iterable, Mapping, Sequence

from ..schema import CheckCondition, Facets, walk_conditions
from ..script_model import (
    Beat,
    BranchBeat,
    ChoiceBeat,
    LoreBeat,
    MetaBeat,
    SayBeat,
    SceneBeat,
)
from ..vocab import DEATH_SCENE, META_ENDGAME, META_LIBRARY
from .visit import BeatWalker

MISSION_KIND = "mission"
MISSION_TRIGGER_KIND = "missionTrigger"
MAIN_MISSION = "main"
STATE_PREFIX = "state-"
FLAG_KINDS = frozenset({"flag", "setflag"})
STAT_KINDS = frozenset({"stat", "setstat"})
RELATION_KINDS = frozenset({"rel", "setrel"})
DICE_KIND = "dice"


def _mission_id(kind: str, key: str, extra: str, owner: Mapping[str, str] | None) -> str:
    if kind == MISSION_TRIGGER_KIND:
        value = key if key and key != "0" else ""
    else:
        value = (owner.get(key) if owner else "") or extra or ""
    return MAIN_MISSION if value.lower() == MAIN_MISSION else value


def _mission_values(
    kind: str,
    key: str,
    extra: str,
    owner: Mapping[str, str] | None,
    named_states: set[str],
) -> tuple[str, ...]:
    values: list[str] = []
    mission = _mission_id(kind, key, extra, owner)
    if mission:
        values.append(mission)
    if kind == MISSION_KIND and key in named_states:
        values.append(f"{STATE_PREFIX}{key}")
    return tuple(values)


class FacetWalker(BeatWalker):
    def __init__(
        self,
        mission_owner: Mapping[str, str] | None,
        named_states: Iterable[str] | None,
    ) -> None:
        self.mission_owner = mission_owner
        self.named_states = set(named_states) if named_states else set()
        self.speakers: set[str] = set()
        self.flags: set[str] = set()
        self.checks: set[str] = set()
        self.stats: set[str] = set()
        self.relations: set[str] = set()
        self.endings: set[str] = set()
        self.chronicles: set[str] = set()
        self.endgames: set[str] = set()
        self.missions: set[str] = set()
        self.option_count = 0
        self.lock_count = 0
        self.dice_check_count = 0

    def say(self, beat: SayBeat) -> None:
        if beat.speaker:
            self.speakers.add(beat.speaker)

    def meta(self, beat: MetaBeat) -> None:
        if beat.kind in (MISSION_KIND, MISSION_TRIGGER_KIND):
            self.missions.update(
                _mission_values(
                    beat.kind, beat.key, beat.extra, self.mission_owner, self.named_states
                )
            )
            return
        if not beat.key:
            return
        if beat.kind == META_LIBRARY:
            self.chronicles.add(beat.key)
        elif beat.kind == META_ENDGAME:
            self.endgames.add(beat.key)
        elif beat.kind in FLAG_KINDS:
            self.flags.add(beat.key)
        elif beat.kind in STAT_KINDS:
            self.stats.add(beat.key)
        elif beat.kind in RELATION_KINDS:
            self.relations.add(beat.key)
        elif beat.kind == DICE_KIND:
            self.checks.add(beat.key)
            self.dice_check_count += 1

    def branch(self, beat: BranchBeat) -> None:
        if beat.check:
            self.checks.add(beat.check.key)
        walk_conditions(beat.cond, on_check=self._on_check)
        super().branch(beat)

    def choice(self, beat: ChoiceBeat) -> None:
        self.option_count += len(beat.options)
        for option in beat.options:
            if option.lock:
                self.lock_count += 1
        super().choice(beat)

    def scene(self, beat: SceneBeat) -> None:
        if beat.scene == DEATH_SCENE and beat.scene_key:
            self.endings.add(beat.scene_key)

    def lore(self, beat: LoreBeat) -> None:
        pass

    def _on_check(self, item: CheckCondition) -> None:
        if item.key:
            self.checks.add(item.key)

    def facets(self) -> Facets:
        return Facets(
            speakers=sorted(self.speakers),
            flags=sorted(self.flags),
            checks=sorted(self.checks),
            stats=sorted(self.stats),
            relations=sorted(self.relations),
            endings=sorted(self.endings),
            chronicles=sorted(self.chronicles),
            endgames=sorted(self.endgames),
            missions=sorted(self.missions),
            option_count=self.option_count,
            lock_count=self.lock_count,
            dice_check_count=self.dice_check_count,
        )


def collect_facets(
    beats: Sequence[Beat],
    extra_check_keys: Iterable[str] | None = None,
    mission_owner: Mapping[str, str] | None = None,
    named_states: Iterable[str] | None = None,
) -> Facets:
    walker = FacetWalker(mission_owner, named_states)
    walker.walk(beats)
    if extra_check_keys:
        walker.checks.update(key for key in extra_check_keys if key)
    return walker.facets()


def merge(base: Facets, battle_facets: Mapping[str, Iterable[str]] | None) -> Facets:
    if not battle_facets:
        return base

    def combine(values: list[str], field: str) -> list[str]:
        return sorted(set(values) | {item for item in battle_facets.get(field) or () if item})

    return Facets(
        speakers=combine(base.speakers, "speakers"),
        flags=combine(base.flags, "flags"),
        checks=combine(base.checks, "checks"),
        stats=combine(base.stats, "stats"),
        relations=combine(base.relations, "relations"),
        endings=combine(base.endings, "endings"),
        chronicles=combine(base.chronicles, "chronicles"),
        endgames=combine(base.endgames, "endgames"),
        missions=combine(base.missions, "missions"),
        option_count=base.option_count,
        lock_count=base.lock_count,
        dice_check_count=base.dice_check_count,
    )
