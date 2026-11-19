from PIL import Image, ImageOps

from ...jsonio import write_bytes
from ..assets import AssetSession, FileScope, _dispose, try_build_generator, unitypy
from ..layout import GameLayout
from .models import THUMBNAIL_SIZE
from .render import crop_digest, png_bytes
from .store import crop_file

MOOD_PANEL_CLASS = "CharacterMoodPanel"

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

SPRITE_MOODS = {sprite: key for key, sprite in MOOD_SPRITES.items()}


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
            write_bytes(path, png_bytes(cell))
        return digest
    finally:
        scaled.close()
        cell.close()


def _mood_key(session: AssetSession, scope: FileScope, entry: dict) -> str:
    holder = scope(entry.get("Right"))
    if holder is None:
        return ""
    tree = session.typetree(scope.path, holder) or {}
    for slot in tree.get("m_Component") or []:
        component = scope(slot.get("component"))
        if component is None:
            continue
        component_tree = session.typetree(scope.path, component) or {}
        sprite_ref = component_tree.get("m_Sprite")
        if not sprite_ref:
            continue
        sprite = scope(sprite_ref)
        if sprite is None:
            continue
        name = str(getattr(sprite.read(), "m_Name", "") or "")
        key = SPRITE_MOODS.get(name)
        if key:
            return key
    return ""


def mood_map(layout: GameLayout) -> dict[str, str]:
    mapping: dict[str, str] = {}
    session = AssetSession(layout, try_build_generator(layout), lambda message: None)
    try:
        for path, obj, _ in session.iter_class({MOOD_PANEL_CLASS}):
            tree = session.typetree(path, obj) or {}
            scope = session.file_scope(path)
            for entry in tree.get("_moods") or []:
                key = _mood_key(session, scope, entry)
                if not key:
                    continue
                for ref in entry.get("Mapping") or []:
                    item = scope(ref)
                    if item is None:
                        continue
                    value = (session.typetree(scope.path, item) or {}).get("Value")
                    if isinstance(value, str) and value:
                        mapping[value] = key
            break
    except Exception:
        return {}
    finally:
        session.close()
    return mapping


def mood_cells(layout: GameLayout) -> dict[str, str]:
    images = _mood_images(layout)
    return {key: _cell_digest(images[key]) for key in sorted(images)}
