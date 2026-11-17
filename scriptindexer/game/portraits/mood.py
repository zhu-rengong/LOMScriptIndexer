from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

from ...jsonio import atomic_write_bytes
from ..assets import _dispose, unitypy
from ..layout import GameLayout

MOOD_SPRITES = {
    "mood-happy.png": "vfx_mood_happy_right_1_15",
    "mood-sweat.png": "vfx_mood_nervous_1_15",
}


def _mood_images(layout: GameLayout) -> dict[str, Image.Image]:
    wanted = {sprite: file for file, sprite in MOOD_SPRITES.items()}
    found: dict[str, Image.Image] = {}
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
                file = wanted.get(getattr(data, "m_Name", ""))
                if file is None or file in found:
                    continue
                found[file] = data.image.convert("RGBA")
            if len(found) == len(wanted):
                return found
        except Exception:
            continue
        finally:
            _dispose(env)
    return found


def export_moods(layout: GameLayout, output: Path) -> bool:
    images = _mood_images(layout)
    for file, image in images.items():
        buffer = BytesIO()
        ImageOps.mirror(image).save(buffer, "PNG", optimize=True)
        atomic_write_bytes(output / file, buffer.getvalue())
    return len(images) == len(MOOD_SPRITES)
