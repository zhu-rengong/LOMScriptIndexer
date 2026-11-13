import hashlib
import threading
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

from ...jsonio import atomic_write_bytes
from ..framing import HEAD_BAND, Frame, default_frame
from .models import (
    PREVIEW_MAX,
    PREVIEW_METHOD,
    PREVIEW_QUALITY,
    THUMBNAIL_SIZE,
    Crop,
    Job,
    Render,
    RenderError,
)
from .store import crop_file, frame_value

_READ_LOCK = threading.Lock()


def picture_of(image: Any) -> Any:
    picture = image if image.mode == "RGBA" else image.convert("RGBA")
    bounds = picture.getchannel("A").getbbox()
    if bounds and bounds != (0, 0, *picture.size):
        picture = picture.crop(bounds)
    return picture


def default_frame_of(picture: Any) -> Frame:
    width, height = picture.size
    band_height = max(4, round(height * HEAD_BAND))
    head = picture.crop((0, 0, width, band_height))
    return default_frame(picture.size, head.getchannel("A").getbbox())


def crop_picture(picture: Any, frame: Frame) -> Any:
    left, top, width, height = frame.box(picture.size)
    crop = picture.crop((left, top, left + width, top + height))
    crop = crop.resize(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
    return crop.transpose(Image.Transpose.FLIP_LEFT_RIGHT)


def crop_digest(picture: Any) -> str:
    width, height = picture.size
    digest = hashlib.sha256(f"{width}x{height}|".encode("ascii"))
    digest.update(picture.tobytes())
    return digest.hexdigest()[:24]


def png_bytes(picture: Any) -> bytes:
    output = BytesIO()
    picture.save(output, format="PNG")
    return output.getvalue()


def preview(picture: Any) -> bytes:
    if picture.width <= PREVIEW_MAX and picture.height <= PREVIEW_MAX:
        crop = picture
    else:
        crop = picture.copy()
        crop.thumbnail((PREVIEW_MAX, PREVIEW_MAX), Image.Resampling.LANCZOS)
    output = BytesIO()
    crop.save(output, format="WEBP", quality=PREVIEW_QUALITY, method=PREVIEW_METHOD)
    return output.getvalue()


def artifact_key(prefix: str, address: str) -> str:
    return hashlib.sha256(f"{prefix}|{address}".encode()).hexdigest()[:24]


def render_address(
    address: str,
    obj: Any,
    artifact: str,
    targets: tuple[tuple[str, str, Frame | None], ...],
    preview_missing: bool,
    preview_dir: Path,
) -> Render:
    try:
        with _READ_LOCK:
            image = obj.read().image
    except Exception as exc:
        raise RenderError("image_read_failed", type(exc).__name__) from exc
    picture = picture_of(image)
    default = default_frame_of(picture)
    name = f"{artifact}.webp"
    record = {"file": name, "size": list(picture.size), "default": default.wire()}
    errors: list[tuple[str, str, str]] = []
    if preview_missing:
        try:
            atomic_write_bytes(preview_dir / name, preview(picture))
        except Exception:
            errors.append(("", "", "preview_write_failed"))
    rendered: dict[tuple[float, float, float], str] = {}
    crops: list[Crop] = []
    for character, expression, frame in targets:
        active = frame or default
        key = (round(active.x, 5), round(active.y, 5), round(active.w, 5))
        digest = rendered.get(key)
        if digest is None:
            try:
                crop = crop_picture(picture, active)
            except Exception:
                errors.append((character, expression, "image_crop_failed"))
                continue
            digest = crop_digest(crop)
            path = crop_file(digest)
            if not path.is_file():
                atomic_write_bytes(path, png_bytes(crop))
            rendered[key] = digest
        crops.append(Crop(character, expression, address, frame_value(frame), digest, artifact))
    return Render(artifact, crops, record, errors)


def render_chunk(
    batch: tuple[Job, ...], preview_dir: Path
) -> list[tuple[str, Render | None, str, str]]:
    results: list[tuple[str, Render | None, str, str]] = []
    for job in batch:
        try:
            render = render_address(
                job.key, job.obj, job.artifact, job.targets, job.preview_missing, preview_dir
            )
        except RenderError as exc:
            results.append((job.key, None, exc.reason, exc.error))
            continue
        except Exception as exc:
            results.append((job.key, None, "render_failed", type(exc).__name__))
            continue
        results.append((job.key, render, "", ""))
    return results
