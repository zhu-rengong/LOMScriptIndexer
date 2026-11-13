from collections.abc import Iterable, Mapping, Sequence

from ..schema import CheckCondition, Facets, walk_conditions
from ..script_model import BranchBeat, ChoiceBeat, MetaBeat, SayBeat, SceneBeat
from ..vocab import DEATH_SCENE


def collect_facets(
    beats: Sequence[object], extra_check_keys: Iterable[str] | None = None
) -> Facets:
    speakers: set[str] = set()
    flags: set[str] = set()
    checks: set[str] = set()
    stats: set[str] = set()
    relations: set[str] = set()
    endings: set[str] = set()
    option_count = 0
    lock_count = 0
    dice_check_count = 0

    def on_check(item: CheckCondition) -> None:
        if item.key:
            checks.add(item.key)

    def walk(rows: Sequence[object]) -> None:
        nonlocal option_count, lock_count, dice_check_count
        for beat in rows:
            if isinstance(beat, SayBeat):
                if beat.speaker:
                    speakers.add(beat.speaker)
            elif isinstance(beat, MetaBeat):
                if not beat.key:
                    continue
                if beat.kind in ("flag", "setflag"):
                    flags.add(beat.key)
                elif beat.kind in ("stat", "setstat"):
                    stats.add(beat.key)
                elif beat.kind in ("rel", "setrel"):
                    relations.add(beat.key)
                elif beat.kind == "dice":
                    checks.add(beat.key)
                    dice_check_count += 1
            elif isinstance(beat, BranchBeat):
                if beat.check:
                    checks.add(beat.check.key)
                walk_conditions(beat.cond, on_check=on_check)
                walk(beat.beats)
            elif isinstance(beat, ChoiceBeat):
                option_count += len(beat.options)
                for option in beat.options:
                    if option.lock:
                        lock_count += 1
                    walk(option.beats)
            elif isinstance(beat, SceneBeat) and beat.scene == DEATH_SCENE and beat.scene_key:
                endings.add(beat.scene_key)

    walk(beats)
    if extra_check_keys:
        checks.update(key for key in extra_check_keys if key)
    return Facets(
        speakers=sorted(speakers),
        flags=sorted(flags),
        checks=sorted(checks),
        stats=sorted(stats),
        relations=sorted(relations),
        endings=sorted(endings),
        option_count=option_count,
        lock_count=lock_count,
        dice_check_count=dice_check_count,
    )


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
        option_count=base.option_count,
        lock_count=base.lock_count,
        dice_check_count=base.dice_check_count,
    )
