from ..interpreter.spec import CallSpec, Semantics
from ..vocab import (
    CHECK_CONDITION_RESULT,
    CHECK_DICE,
    CHECK_POSITION,
    CHECK_SWITCH,
    EDGE_JUMP,
    EDGE_TEMP_SCRIPT,
    EDGE_TRAVEL,
)

OFFSTAGE_POSITIONS = frozenset(
    {
        "SL",
        "SR",
        "SLB",
        "SRB",
        "LB1",
        "LB2",
        "LB3",
        "MB",
        "RB1",
        "RB2",
        "RB3",
        "BCB2",
    }
)

SUNK_POSITIONS = {
    "LB1": -2169.73,
    "LB2": -2169.73,
    "LB3": -2169.73,
    "MB": -2169.73,
    "RB1": -2169.73,
    "RB2": -2169.73,
    "RB3": -2169.73,
    "BCB2": -3500.0,
}

STAGE_FLOOR = -2160.0

LUA_BINDINGS = Semantics(
    narration_dialogs=frozenset({"center", "center2", "narrative"}),
    think_dialogs=frozenset({"think"}),
    speaker_sentinels=frozenset(
        {
            "narrative",
            "narrator",
            "none",
            "center",
            "center2",
            "think",
        }
    ),
    jumps={
        "SetNextScript": EDGE_JUMP,
        "SetCurrentStoryScript": EDGE_JUMP,
        "SetTempScript": EDGE_TEMP_SCRIPT,
        "SetCurrentTravelScript": EDGE_TRAVEL,
    },
    story_jumps=frozenset({"SetNextScript", "SetCurrentStoryScript"}),
    check_methods={
        "Switch": CHECK_SWITCH,
        "Dice": CHECK_DICE,
        "Condition": CHECK_CONDITION_RESULT,
        "Position": CHECK_POSITION,
    },
    time_object="luamanager",
    time_method="SetGameTime",
    stage_hide_method="hide",
    offstage_positions=OFFSTAGE_POSITIONS,
    sunk_positions=SUNK_POSITIONS,
    stage_floor=STAGE_FLOOR,
    character_offset_methods=("MoveOffset", "MoveOffsetCoroutine"),
    call_runner="runwait",
    view_object="flowcharts.view",
    view_block_method="runblock",
    view_hidden_blocks=frozenset({"out", "out_white", "out_2"}),
    view_shown_blocks=frozenset({"view", "view_white"}),
    effects={
        "Player": CallSpec("stat", value_index=1, display_index=3),
        "Character": CallSpec("rel", value_index=1, display_index=2),
        "SetPlayer": CallSpec("setstat", value_index=1),
        "SetCharacter": CallSpec("setrel", value_index=1),
        "SetFlag": CallSpec("setflag", value_index=1),
        "AddFlag": CallSpec("flag", value_index=1),
        "AddStory": CallSpec("story"),
        "AddBook": CallSpec("book", value_index=1, value_delta=1),
        "RemoveBook": CallSpec("book", value_index=1, value_delta=-1),
        "AddMisc": CallSpec("misc", value_index=1, value_delta=1),
        "RemoveMisc": CallSpec("misc", value_index=1, value_delta=-1),
        "AddSpecial": CallSpec("special", value_index=1, value_delta=1),
        "RemoveSpecial": CallSpec("special", value_index=1, value_delta=-1),
        "AddTalent": CallSpec("talent", value_index=1, value_delta=1),
        "AddAchievementLib": CallSpec("library"),
        "Mission": CallSpec("mission", key_index=1, key_fallback=0, extra_index=0),
        "IsTriggerSubMission": CallSpec("missionTrigger", key_index=0, value_index=1),
    },
    dice_roll_methods=("ExecuteRoll", "Setup", "SetRandom"),
)
