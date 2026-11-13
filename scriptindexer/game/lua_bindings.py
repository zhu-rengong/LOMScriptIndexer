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
