from collections.abc import Sequence

from ..schema import ShardInfo

MIN_SCRIPT_SHARD_BYTES = 700 * 1024
MAX_SCRIPT_SHARDS = 24
CHECKPOINT_SHARDS = 8


def shard_key(index: int) -> str:
    if 0 <= index < 26:
        return chr(ord("a") + index)
    return f"s{index}"


def _bins(
    ids: Sequence[str], sizes: dict[str, int], chapter_of: dict[str, int], limit: int
) -> list[dict]:
    grouped: dict[int, list[str]] = {}
    for sid in ids:
        grouped.setdefault(chapter_of.get(sid, -1), []).append(sid)
    bins: list[dict] = []
    current: dict | None = None

    def flush() -> None:
        nonlocal current
        if current and current["ids"]:
            bins.append(current)
        current = None

    for chapter in sorted(grouped):
        members = grouped[chapter]
        weight = sum(sizes.get(sid, 0) for sid in members)
        if weight > limit:
            flush()
            for sid in members:
                size = sizes.get(sid, 0)
                if current is None or current["bytes"] + size > limit:
                    flush()
                    current = {"ids": [], "bytes": 0, "chapter_indexes": set()}
                current["ids"].append(sid)
                current["bytes"] += size
                current["chapter_indexes"].add(chapter)
            continue
        if current is not None and current["bytes"] + weight > limit:
            flush()
        if current is None:
            current = {"ids": [], "bytes": 0, "chapter_indexes": set()}
        current["ids"].extend(members)
        current["bytes"] += weight
        current["chapter_indexes"].add(chapter)
    flush()
    return bins


def pack_scripts(
    ids: Sequence[str],
    sizes: dict[str, int],
    chapter_of: dict[str, int],
    chapter_ids: Sequence[str],
    min_bytes_per_shard: int = MIN_SCRIPT_SHARD_BYTES,
    max_shards: int = MAX_SCRIPT_SHARDS,
) -> tuple[dict[str, str], list[ShardInfo]]:
    total = sum(sizes.get(sid, 0) for sid in ids)
    budget = max(1, min_bytes_per_shard, -(-total // max_shards))
    bins = _bins(ids, sizes, chapter_of, budget)
    while len(bins) > max_shards and budget < total:
        budget = int(budget * 1.25) + 1
        bins = _bins(ids, sizes, chapter_of, budget)

    assignment: dict[str, str] = {}
    shards: list[ShardInfo] = []
    for index, item in enumerate(bins):
        key = shard_key(index)
        for sid in item["ids"]:
            assignment[sid] = key
        shards.append(
            ShardInfo(
                key=key,
                node_count=len(item["ids"]),
                bytes=item["bytes"],
                chapter_ids=[
                    chapter_ids[chapter]
                    for chapter in sorted(item["chapter_indexes"])
                    if 0 <= chapter < len(chapter_ids)
                ],
            )
        )
    return assignment, shards


def shard_index_by_key(keys: Sequence[str], shard_count: int) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for key in keys:
        value = 0
        for character in key:
            value = (value * 31 + ord(character)) & 0xFFFF
        mapping[key] = value % shard_count
    return mapping
