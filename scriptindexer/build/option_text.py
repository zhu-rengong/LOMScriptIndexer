from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..game.unity_objects import coerce_int
from ..script_model import Requirement
from ..vocab import COMPARE_TOKEN_SYMBOLS

REQUIREMENT_SEPARATOR = "|"
COMPOSITE_SEPARATOR = "+"
COMPOSITE_LIMIT = 120
REQUIREMENT_ACTION = "action"
REQUIREMENT_CONTRIBUTION = "contribution"
MINIMUM_OPERATOR = "≥"


@dataclass(frozen=True)
class OptionView:
    text: str
    requirement: Requirement | None = None
    action: str = ""
    requirements: tuple[dict[str, Any], ...] = field(default_factory=tuple)


def split_requirement(value: str) -> tuple[str, Requirement | None]:
    if REQUIREMENT_SEPARATOR not in value:
        return value, None
    head, tail = value.split(REQUIREMENT_SEPARATOR, 1)
    tail = tail.strip()
    if not tail:
        return head, None
    for token, symbol in COMPARE_TOKEN_SYMBOLS:
        if tail.startswith(token):
            return head, Requirement(symbol, tail[len(token) :].strip())
    return head, Requirement("", tail)


def decode_composite_option(value: str, story_table: Mapping[str, str]) -> OptionView:
    parts = value.split(COMPOSITE_SEPARATOR)
    action = parts[0]
    title = ""
    for part in parts[1:]:
        match = story_table.get(part)
        if match:
            title = match
            break
    if not title:
        title = " / ".join(parts[1:])
    requirements: list[dict[str, Any]] = []
    if len(parts) >= 4:
        action_count = coerce_int(parts[2])
        contribution = coerce_int(parts[3])
        if action_count > 0:
            requirements.append(
                {
                    "kind": REQUIREMENT_ACTION,
                    "op": MINIMUM_OPERATOR,
                    "value": action_count,
                }
            )
        if contribution > 0:
            requirements.append(
                {
                    "kind": REQUIREMENT_CONTRIBUTION,
                    "op": MINIMUM_OPERATOR,
                    "value": contribution,
                }
            )
    return OptionView(title, None, action, tuple(requirements))


def decode_option(story_text: str, story_table: Mapping[str, str]) -> OptionView:
    match = story_table.get(story_text)
    if match is not None:
        return OptionView(match)
    if COMPOSITE_SEPARATOR in story_text and len(story_text) <= COMPOSITE_LIMIT:
        return decode_composite_option(story_text, story_table)
    head, requirement = split_requirement(story_text)
    if requirement is not None:
        return OptionView(story_table.get(head, head), requirement)
    return OptionView(story_text)
