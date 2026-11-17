from PIL import Image, ImageOps

from ...jsonio import atomic_write_bytes
from ..assets import _dispose, unitypy
from ..layout import GameLayout
from .models import THUMBNAIL_SIZE
from .render import crop_digest, png_bytes
from .store import crop_file

MOOD_SPRITES = {
    "happy": "vfx_mood_happy_right_1_15",
    "nervous1": "vfx_mood_nervous_1_15",
    "nervous2": "vfx_mood_nervous_2_15",
    "nervous3": "vfx_mood_nervous_3_15",
    "nervous4": "vfx_mood_nervous_4_15",
    "angry": "vfx_mood_angry_1_15",
    "shy": "vfx_mood_shy_1_15",
    "shock": "vfx_mood_shock_1_15",
    "silent": "vfx_mood_silent_1_15",
}


def _mood_images(layout: GameLayout) -> dict[str, Image.Image]:
    wanted = {sprite: key for key, sprite in MOOD_SPRITES.items()}
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
                key = wanted.get(getattr(data, "m_Name", ""))
                if key is None or key in found:
                    continue
                found[key] = data.image.convert("RGBA")
            if len(found) == len(wanted):
                return found
        except Exception:
            continue
        finally:
            _dispose(env)
    return found


def _cell_digest(image: Image.Image) -> str:
    width, height = THUMBNAIL_SIZE
    picture = ImageOps.mirror(image).convert("RGBA")
    scale = min(width / picture.width, height / picture.height)
    size = (max(1, round(picture.width * scale)), max(1, round(picture.height * scale)))
    scaled = picture.resize(size, Image.Resampling.LANCZOS)
    cell = Image.new("RGBA", THUMBNAIL_SIZE, (0, 0, 0, 0))
    try:
        cell.paste(scaled, ((width - size[0]) // 2, 0))
        digest = crop_digest(cell)
        path = crop_file(digest)
        if not path.is_file():
            atomic_write_bytes(path, png_bytes(cell))
        return digest
    finally:
        scaled.close()
        cell.close()


def mood_cells(layout: GameLayout) -> dict[str, str]:
    images = _mood_images(layout)
    return {key: _cell_digest(images[key]) for key in sorted(images)}
