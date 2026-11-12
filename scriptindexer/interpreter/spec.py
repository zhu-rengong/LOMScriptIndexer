from dataclasses import dataclass, field
from typing import Mapping


@dataclass(frozen=True)
class CallSpec:
    kind: str
    key_index: int = 0
    key_fallback: int | None = None
    value_index: int | None = None
    value_delta: int = 0
    display_index: int | None = None


@dataclass(frozen=True)
class Semantics:
    say_method: str = "say"
    speaker_method: str = "setcharacter"
    dialog_method: str = "setsaydialog"
    choice_method: str = "choose"
    think_object: str = "os_mask"
    think_method: str = "Show"
    narration_dialogs: frozenset[str] = frozenset()
    think_dialogs: frozenset[str] = frozenset()
    speaker_sentinels: frozenset[str] = frozenset()
    jumps: Mapping[str, str] = field(default_factory=dict)
    story_jumps: frozenset[str] = frozenset()
    scene_object: str = "luamanager"
    scene_method: str = "ChangeScene"
    scene_arg_count: int = 3
    init_method: str = "Init"
    time_object: str = "luamanager"
    time_method: str = "SetGameTime"
    check_object: str = "checkpointmanager"
    check_methods: Mapping[str, str] = field(default_factory=dict)
    stat_object: str = "statmodifymanager"
    effects: Mapping[str, CallSpec] = field(default_factory=dict)
    dice_object: str = "dicemenudialog"
    dice_roll_methods: tuple[str, ...] = ()
    dice_result_field: str = "ResultSelection"
    story_getter: str = "GetStoryText"
    character_object: str = "characters"
    character_get: str = "Get"
    character_portrait: str = "GetPortrait"
    character_load_portrait: str = "LoadCharacterPortrait"
    stage_object: str = "stage"
    stage_portrait_method: str = "showPortrait"
    stage_show_method: str = "show"
    stat_getter_prefix: str = "Get"
