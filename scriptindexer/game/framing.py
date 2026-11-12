import hashlib
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..jsonio import read_json
from ..paths import FRAMING_PATH

FRAMING_VERSION = 1
AVATAR_SIZE = (80, 92)
AVATAR_ASPECT = AVATAR_SIZE[0] / AVATAR_SIZE[1]
HEAD_BAND = 0.42
FRAME_DIGITS = 5
FRAME_TOLERANCE = 0.0005
MIN_FRAME_WIDTH = 0.01

Box = tuple[int, int, int, int]


@dataclass(frozen=True)
class Frame:
    x: float
    y: float
    w: float

    def box(self, size: tuple[int, int]) -> Box:
        width, height = size
        box_w = max(1, round(self.w * width))
        box_h = max(1, round(box_w / AVATAR_ASPECT))
        if box_h > height:
            box_h = height
            box_w = max(1, round(box_h * AVATAR_ASPECT))
        if box_w > width:
            box_w = width
            box_h = max(1, min(height, round(box_w / AVATAR_ASPECT)))
        left = max(0, min(width - box_w, round(self.x * width)))
        top = max(0, min(height - box_h, round(self.y * height)))
        return left, top, box_w, box_h

    def wire(self) -> dict[str, float]:
        return {
            "x": round(min(max(self.x, 0.0), 1.0), FRAME_DIGITS),
            "y": round(min(max(self.y, 0.0), 1.0), FRAME_DIGITS),
            "w": round(min(max(self.w, MIN_FRAME_WIDTH), 1.0), FRAME_DIGITS),
        }

    def matches(self, other: Frame) -> bool:
        return (abs(self.x - other.x) <= FRAME_TOLERANCE
                and abs(self.y - other.y) <= FRAME_TOLERANCE
                and abs(self.w - other.w) <= FRAME_TOLERANCE)


def default_frame(size: tuple[int, int], focus: Box | None) -> Frame:
    width, height = size
    band_height = max(4, round(height * HEAD_BAND))
    band_width = min(width, max(4, round(band_height * AVATAR_ASPECT)))
    center = (focus[0] + focus[2]) // 2 if focus else width // 2
    left = max(0, min(width - band_width, center - band_width // 2))
    return Frame(left / width, 0.0, band_width / width)


def parse_frame(value: Any) -> Frame | None:
    if not isinstance(value, dict):
        return None
    try:
        x = float(value["x"])
        y = float(value["y"])
        w = float(value["w"])
    except (KeyError, TypeError, ValueError):
        return None
    if not all(math.isfinite(item) for item in (x, y, w)):
        return None
    width = min(max(w, MIN_FRAME_WIDTH), 1.0)
    return Frame(min(max(x, 0.0), 1.0 - width), min(max(y, 0.0), 1.0), width)


def load_frames(path: Path = FRAMING_PATH) -> dict[str, dict[str, Frame]]:
    payload = read_json(path)
    if not isinstance(payload, dict) or payload.get("version") != FRAMING_VERSION:
        return {}
    raw = payload.get("frames")
    if not isinstance(raw, dict):
        return {}
    frames: dict[str, dict[str, Frame]] = {}
    for character, table in raw.items():
        if not isinstance(character, str) or not character or not isinstance(table, dict):
            continue
        for expression, value in table.items():
            if not isinstance(expression, str) or not expression:
                continue
            frame = parse_frame(value)
            if frame is None:
                continue
            frames.setdefault(character, {})[expression] = frame
    return frames


def framing_digest(path: Path = FRAMING_PATH) -> str:
    try:
        payload = path.read_bytes()
    except OSError:
        return "none"
    return hashlib.sha256(payload).hexdigest()[:16]


__all__ = [
    "AVATAR_ASPECT",
    "AVATAR_SIZE",
    "FRAMING_VERSION",
    "FRAME_DIGITS",
    "FRAME_TOLERANCE",
    "Frame",
    "HEAD_BAND",
    "MIN_FRAME_WIDTH",
    "default_frame",
    "framing_digest",
    "load_frames",
    "parse_frame",
]
