from pathlib import Path, PurePosixPath

from ..assets import AssetSession
from ..framing import Frame
from .models import Plan, Previous, Target
from .store import crop_file, same_frame_value


def special_id(segment: str) -> str | None:
    pieces = segment.split("_")
    if len(pieces) < 3 or pieces[0] != "Special" or not pieces[1].isdigit():
        return None
    return pieces[1]


def anchors(expressions: dict[str, str], index: dict[str, Path]) -> dict[tuple[str, str], set[str]]:
    groups: dict[tuple[str, str], set[str]] = {}
    for address in expressions.values():
        if address not in index:
            continue
        parts = address.split("/")
        for depth, segment in enumerate(parts[:-1]):
            ident = special_id(segment)
            if ident is None:
                continue
            groups.setdefault(("/".join(parts[:depth]), ident), set()).add(segment)
    return groups


def stem_index(index: dict[str, Path]) -> dict[str, list[str]]:
    stems: dict[str, list[str]] = {}
    for address in index:
        stems.setdefault(PurePosixPath(address).stem, []).append(address)
    return stems


def resolve(
    address: str,
    index: dict[str, Path],
    stems: dict[str, list[str]],
    groups: dict[tuple[str, str], set[str]],
) -> str | None:
    if address in index:
        return address
    if "/" not in address:
        matches = stems.get(PurePosixPath(address).stem) or []
        return matches[0] if len(matches) == 1 else None
    parts = address.split("/")
    for depth, segment in enumerate(parts[:-1]):
        ident = special_id(segment)
        if ident is None:
            continue
        parent = "/".join(parts[:depth])
        tail = "/".join(parts[depth + 1 :])
        matches: list[str] = []
        for folder in groups.get((parent, ident), ()):
            candidate = f"{parent}/{folder}/{tail}" if parent else f"{folder}/{tail}"
            if candidate in index:
                matches.append(candidate)
        if len(matches) == 1:
            return matches[0]
    return None


def reusable(
    previous: Previous,
    character: str,
    expression: str,
    address: str,
    override: Frame | None,
    preview_dir: Path,
) -> dict | None:
    table = previous.crops.get(character) if previous.crops else None
    record = table.get(expression) if isinstance(table, dict) else None
    if not isinstance(record, dict) or record.get("address") != address:
        return None
    if not same_frame_value(override, record.get("frame")):
        return None
    cell = record.get("cell")
    artifact = record.get("artifact")
    if not isinstance(cell, str) or not crop_file(cell).is_file():
        return None
    if not isinstance(artifact, str):
        return None
    stored = previous.previews.get("artifacts")
    entry = stored.get(artifact) if isinstance(stored, dict) else None
    name = entry.get("file") if isinstance(entry, dict) else None
    if not isinstance(name, str) or not (preview_dir / name).is_file():
        return None
    return record


def plan_crops(
    characters: dict[str, dict[str, str]],
    index: dict[str, Path],
    frames: dict[str, dict[str, Frame]],
    previous: Previous | None,
    preview_dir: Path,
) -> Plan:
    grouped: dict[Path, dict[str, list[Target]]] = {}
    missing: list[dict] = []
    crops: dict[tuple[str, str], dict] = {}
    stems = stem_index(index)
    recovered = 0
    for character, expressions in sorted(characters.items()):
        table = frames.get(character, {})
        groups = anchors(expressions, index)
        for expression, address in sorted(expressions.items()):
            resolved = resolve(address, index, stems, groups)
            if resolved is None:
                missing.append(
                    {"character": character, "expression": expression, "address": address}
                )
                continue
            if resolved != address:
                recovered += 1
            override = table.get(expression)
            if previous is not None:
                reused = reusable(previous, character, expression, resolved, override, preview_dir)
                if reused is not None:
                    crops[(character, expression)] = reused
                    continue
            entry = grouped.setdefault(index[resolved], {}).setdefault(resolved, [])
            entry.append((character, expression, override))
    return Plan(grouped, missing, crops, recovered)


def character_expressions(session: AssetSession) -> tuple[dict[str, dict[str, str]], list[dict]]:
    configs = list(session.iter_class({"StoryCharacterConfig"}))
    if not configs:
        raise ValueError("StoryCharacterConfig not found")
    path, obj, _ = configs[0]
    config = session.typetree(path, obj) or {}
    scope = session.file_scope(path)
    characters: dict[str, dict[str, str]] = {}
    issues: list[dict] = []
    for ref in config.get("_list") or []:
        hit = scope.resolve(ref)
        if hit is None:
            issues.append({"reason": "missing_character_data"})
            continue
        data_obj, data_scope = hit
        record = data_scope.session.typetree(data_scope.path, data_obj) or {}
        character = (data_scope.typetree(record.get("_mapping")) or {}).get("Value")
        if not isinstance(character, str) or not character:
            issues.append({"reason": "missing_character_mapping"})
            continue
        expressions = characters.setdefault(character, {})
        for item in record.get("_portraitResourceList") or []:
            expression = (data_scope.typetree(item.get("_mapping")) or {}).get("Value")
            address = item.get("_addressKey")
            if (
                not isinstance(expression, str)
                or not expression
                or not isinstance(address, str)
                or not address
            ):
                issues.append({"character": character, "reason": "missing_portrait_mapping"})
                continue
            normalized = address.replace("\\", "/")
            known = expressions.get(expression)
            if known is not None and known != normalized:
                issues.append(
                    {
                        "character": character,
                        "expression": expression,
                        "reason": "conflicting_address",
                    }
                )
                continue
            expressions[expression] = normalized
    return characters, issues
