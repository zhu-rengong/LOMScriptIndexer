from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

from ...jsonio import atomic_write_bytes
from ..assets import _dispose, unitypy
from ..layout import GameLayout

HAPPY_MOOD_SPRITE = "vfx_mood_happy_right_1_15"
HAPPY_MOOD_FILE = "mood-happy.png"


def _happy_sprite(layout: GameLayout) -> Image.Image | None:
    for path in layout.files:
        try:
            env = unitypy().load(str(path))
        except Exception:
            continue
        try:
            for obj in env.objects:
                if obj.type.name != "Sprite":
                    continue
                data = obj.read()
                if getattr(data, "m_Name", "") == HAPPY_MOOD_SPRITE:
                    return data.image.convert("RGBA")
        except Exception:
            continue
        finally:
            _dispose(env)
    return None


def export_happy_mood(layout: GameLayout, output: Path) -> bool:
    image = _happy_sprite(layout)
    if image is None:
        return False
    buffer = BytesIO()
    ImageOps.mirror(image).save(buffer, "PNG", optimize=True)
    atomic_write_bytes(output / HAPPY_MOOD_FILE, buffer.getvalue())
    return True
