import time
from concurrent.futures import ThreadPoolExecutor
from itertools import repeat
from pathlib import Path
from typing import Any

from ...console import Reporter
from ..assets import _dispose, unitypy
from .models import CHUNK_SIZE, Crop, Export, Job, Render
from .render import artifact_key, render_chunk


def export_crops(
    grouped: dict[Path, dict[str, list[tuple[str, str, Any]]]],
    preview_dir: Path,
    issues: list[dict],
    reporter: Reporter,
    jobs: int,
    force_previews: bool,
) -> Export:
    crops: list[Crop] = []
    previews: dict[str, dict] = {}
    started = time.monotonic()
    total = len(grouped)
    targets_total = sum(len(entries) for table in grouped.values() for entries in table.values())
    serial = jobs <= 1 or (total <= 1 and targets_total <= CHUNK_SIZE)
    executor = None if serial else ThreadPoolExecutor(max_workers=jobs)
    completed = 0

    def merge(chunk: list[tuple[str, Render | None, str, str]]) -> None:
        for key, render, failure, detail in chunk:
            if render is None:
                issues.append({"address": key, "reason": failure, "error": detail})
                continue
            previews[render.artifact] = render.preview
            crops.extend(render.crops)
            for character, expression, reason in render.errors:
                entry = {"address": key, "reason": reason}
                if character:
                    entry["character"] = character
                if expression:
                    entry["expression"] = expression
                issues.append(entry)

    def note() -> None:
        nonlocal completed
        completed += 1
        if completed % 20 == 0 or completed == total:
            reporter.info(
                f"portraits: {completed}/{total} bundles, {len(crops)} crops,"
                f" {time.monotonic() - started:.1f}s"
            )

    try:
        for bundle, targets in sorted(grouped.items()):
            env: Any = None
            try:
                env = unitypy().load(str(bundle))
                stat = bundle.stat()
                objects: dict[str, Any] = {}
                for address, obj in sorted(
                    env.container.items(), key=lambda pair: pair[1].type.name != "Sprite"
                ):
                    key = address.replace("\\", "/")
                    if key not in targets or key in objects:
                        continue
                    if obj.type.name not in ("Sprite", "Texture2D"):
                        continue
                    objects[key] = obj
            except Exception as exc:
                issues.append(
                    {
                        "bundle": bundle.name,
                        "reason": "bundle_read_failed",
                        "error": type(exc).__name__,
                    }
                )
                if env is not None:
                    _dispose(env)
                note()
                continue
            try:
                prefix = f"{bundle.name}|{stat.st_size}|{stat.st_mtime_ns}"
                batch: list[Job] = []
                for key, entries in sorted(targets.items()):
                    obj = objects.get(key)
                    if obj is None:
                        issues.append({"address": key, "reason": "sprite_not_found"})
                        continue
                    artifact = artifact_key(prefix, key)
                    missing = force_previews or not (preview_dir / f"{artifact}.webp").is_file()
                    batch.append(Job(key, obj, artifact, tuple(entries), missing))
                chunks = [
                    tuple(batch[index : index + CHUNK_SIZE])
                    for index in range(0, len(batch), CHUNK_SIZE)
                ]
                if serial or executor is None:
                    for chunk in chunks:
                        merge(render_chunk(chunk, preview_dir))
                else:
                    for result in executor.map(render_chunk, chunks, repeat(preview_dir)):
                        merge(result)
            finally:
                _dispose(env)
            note()
    finally:
        if executor is not None:
            executor.shutdown(wait=True)
    return Export(crops, previews)
