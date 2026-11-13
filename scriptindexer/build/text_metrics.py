import re
from collections.abc import Mapping, Sequence

TEXT_KINDS: tuple[str, ...] = ("dialog", "narration", "think", "option", "lore")

_MARKUP_TAG = re.compile(r"\{[^{}]*\}")
_CJK = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
_CJK_EXT = re.compile(r"[\U00020000-\U0002a6df]")
_LATIN_WORD = re.compile(r"[A-Za-z]+")

type WordCount = tuple[int, int]


def strip_markup(text: str) -> str:
    if not text:
        return ""
    return _MARKUP_TAG.sub(" ", str(text)).replace("\r", " ").replace("\n", " ")


def measure_text(text: str) -> WordCount:
    clean = strip_markup(text)
    if not clean:
        return 0, 0
    return (
        len(_CJK.findall(clean)) + len(_CJK_EXT.findall(clean)),
        len(_LATIN_WORD.findall(clean)),
    )


class TextCounter:
    def __init__(self) -> None:
        self.counts_by_kind: dict[str, list[int]] = {kind: [0, 0] for kind in TEXT_KINDS}

    def add_text(self, kind: str, text: str) -> None:
        zh, en = measure_text(text)
        bucket = self.counts_by_kind.setdefault(kind, [0, 0])
        bucket[0] += zh
        bucket[1] += en

    def counts_vector(self) -> list[list[int]]:
        return [
            [self.counts_by_kind.get(kind, [0, 0])[0], self.counts_by_kind.get(kind, [0, 0])[1]]
            for kind in TEXT_KINDS
        ]


def empty_counts() -> list[list[int]]:
    return [[0, 0] for _ in TEXT_KINDS]


def add_counts(target: list[list[int]], counts: Sequence[Sequence[int]]) -> None:
    for index in range(min(len(target), len(counts))):
        target[index][0] += counts[index][0]
        target[index][1] += counts[index][1]


def sum_counts(rows: Mapping[str, list[list[int]]]) -> list[list[int]]:
    out = empty_counts()
    for counts in rows.values():
        add_counts(out, counts)
    return out
