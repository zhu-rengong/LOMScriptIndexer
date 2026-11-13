import re
from collections.abc import Sequence

from ..schema import ChapterRow
from ..vocab import (
    CHAPTER_ACT,
    CHAPTER_CHAPTER,
    CHAPTER_EVENT,
    CHAPTER_FREE,
    CHAPTER_KINDS,
    CHAPTER_MISC,
    CHAPTER_OTHER,
    CHAPTER_PROLOGUE,
    CHAPTER_SCENE,
    CHAPTER_SECTION,
    CHAPTER_TRAVEL,
    CHAPTER_WORK,
)

Pattern = re.Pattern[str]


class ChapterRule:
    __slots__ = ("pattern", "kind", "number_group", "kind_when_zero")

    def __init__(
        self,
        pattern: Pattern,
        kind: str,
        number_group: int | None = None,
        kind_when_zero: str | None = None,
    ) -> None:
        self.pattern = pattern
        self.kind = kind
        self.number_group = number_group
        self.kind_when_zero = kind_when_zero


CHAPTER_RULES: tuple[ChapterRule, ...] = (
    ChapterRule(re.compile(r"^ch(\d+)_", re.IGNORECASE), CHAPTER_CHAPTER, 1, CHAPTER_PROLOGUE),
    ChapterRule(re.compile(r"^act(\d+)", re.IGNORECASE), CHAPTER_ACT, 1),
    ChapterRule(re.compile(r"^[sS](\d{2})\d{2}_"), CHAPTER_EVENT, 1),
    ChapterRule(
        re.compile(r"^(door|room|center|back|meeting|mall|teashop|fortress|talk|shop|inn)"),
        CHAPTER_SCENE,
    ),
    ChapterRule(
        re.compile(r"^(kitchen|pharmacy|alchemy|craft|forge|chess|fish|farm|work|labour)"),
        CHAPTER_WORK,
    ),
    ChapterRule(re.compile(r"^travel", re.IGNORECASE), CHAPTER_TRAVEL),
    ChapterRule(re.compile(r"^section_\d+_free", re.IGNORECASE), CHAPTER_FREE),
    ChapterRule(re.compile(r"^section_", re.IGNORECASE), CHAPTER_SECTION),
    ChapterRule(re.compile(r"^(legend|library|book|event|mission)", re.IGNORECASE), CHAPTER_MISC),
)

CHAPTER_PALETTE: tuple[str, ...] = (
    "#C8A96A",
    "#B4453B",
    "#6E8B8F",
    "#A8763E",
    "#7FA36B",
    "#8C7CA8",
    "#C98B6B",
    "#5B8FA8",
    "#A8A06B",
    "#9C6B8F",
    "#6B8FA8",
    "#B08A5B",
    "#8FA86B",
    "#A85B77",
    "#5B77A8",
    "#A88F5B",
)

CHAPTER_RANK: dict[str, int] = {kind: index for index, kind in enumerate(CHAPTER_KINDS)}


def classify(script_id: str) -> tuple[str, int | None]:
    for rule in CHAPTER_RULES:
        match = rule.pattern.match(script_id)
        if not match:
            continue
        number = int(match.group(rule.number_group)) if rule.number_group else None
        kind = rule.kind_when_zero if number == 0 and rule.kind_when_zero else rule.kind
        return kind, number
    return CHAPTER_OTHER, None


def chapter_id(kind: str, number: int | None) -> str:
    if number is None:
        return kind
    if kind in (CHAPTER_CHAPTER, CHAPTER_PROLOGUE):
        return f"ch{number}"
    if kind == CHAPTER_ACT:
        return f"act{number}"
    if kind == CHAPTER_EVENT:
        return f"s{number:02d}"
    return f"{kind}{number}"


def build_chapters(script_ids: Sequence[str]) -> tuple[list[ChapterRow], dict[str, int]]:
    order: list[str] = []
    kinds: dict[str, tuple[str, int | None]] = {}
    counts: dict[str, int] = {}
    for sid in script_ids:
        kind, number = classify(sid)
        key = chapter_id(kind, number)
        if key not in kinds:
            order.append(key)
            kinds[key] = (kind, number)
            counts[key] = 0
        counts[key] += 1

    def sort_key(key: str) -> tuple[int, int, str]:
        kind, number = kinds[key]
        return CHAPTER_RANK.get(kind, len(CHAPTER_RANK)), number or 0, key

    order.sort(key=sort_key)
    chapters = [
        ChapterRow(
            id=key,
            kind=kinds[key][0],
            number=kinds[key][1],
            color=CHAPTER_PALETTE[index % len(CHAPTER_PALETTE)],
            script_count=counts[key],
        )
        for index, key in enumerate(order)
    ]
    return chapters, {key: index for index, key in enumerate(order)}
