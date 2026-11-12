from ..vocab import (
    VALUE_BOOK,
    VALUE_BOOK_LEVEL,
    VALUE_BOOK_MASTER,
    VALUE_CHRONICLE,
    VALUE_CONDITION,
    VALUE_FLAG,
    VALUE_GROUP,
    VALUE_MISC,
    VALUE_REL,
    VALUE_SPECIAL,
    VALUE_STAT,
    VALUE_TALENT,
    VALUE_TIME,
    VALUE_UPGRADE,
    VALUE_UPGRADE_LEVEL,
)

CHECKPOINT_CLASSES: dict[str, str] = {
    "SwitchResultData": "switch",
    "ConditionResultData": "condition",
    "DiceResultData": "dice",
    "PositionResultData": "position",
    "FlagData": "flag",
}

POSITION_CLASS = "PositionResultData"
STAT_CLASS = "GameStat"

MISSION_CLASS = "MissionData"
MISSION_MANAGER_CLASS = "MissionManagerData"
SUB_MISSIONS_CLASS = "SubMissionsData"
MISSION_CLASSES = frozenset({
    MISSION_CLASS, MISSION_MANAGER_CLASS, SUB_MISSIONS_CLASS,
})
MISSION_DATA_FIELDS: tuple[str, ...] = ("_name", "_desc", "_initKey", "_missions")
MISSION_STATE_FIELDS: tuple[str, ...] = (
    "_active", "_desc", "_position", "_conditions", "_beforeMainMission",
    "_dayCheck", "_timeCheckType", "_specificTime", "_minTime", "_maxTime",
    "_periodStage", "_startScript", "_nextStateName", "_startDialogs",
    "_alertDialogs", "_modifyFlagsWhenTrue", "_modifyFlagsWhenFalse",
)

POSITION_CODES: dict[int, str] = {
    0: "",
    1: "Mall",
    2: "Center",
    3: "Alchemy",
    4: "Forge",
    5: "BackMountain",
    6: "Room1",
    7: "Door",
    8: "Study",
    9: "Kitchen",
    10: "Room2",
    11: "Secret",
}

PORTRAIT_CODES: dict[int, str] = {
    0: "normal",
    100: "laugh1",
    101: "laugh2",
    200: "nervous1",
    201: "nervous2",
    202: "nervous3",
    203: "nervous4",
    300: "angry1",
    301: "angry2",
    302: "angry3",
    400: "gloomy1",
    401: "gloomy2",
    500: "serious",
    501: "hurt",
    502: "revel",
    503: "shy",
    504: "handsome",
    505: "love",
    506: "silent",
    507: "shock",
    508: "tired",
    509: "hurt2",
    600: "suck1",
    601: "suck2",
    602: "suck3",
    603: "suck4",
    604: "black",
    605: "die",
    700: "sad1",
    701: "sad2",
    900: "special1",
    901: "special2",
    903: "special3",
    904: "special4",
    905: "special5",
    906: "special6",
    907: "special7",
    908: "special8",
    909: "special9",
    910: "special10",
    911: "special11",
    912: "special12",
    913: "special13",
}

BATTLE_CLASS = "BattleLevel"
COMBAT_CLASS = "CombatLevel"
COMBAT_ACTION_CLASS = "CombatEventAction"
COMBAT_CONDITION_CLASS = "CombatEventCondition"
BATTLE_ACTION_CLASS = "BattleEventAction"
BATTLE_PREFIX = "BL_"
COMBAT_PREFIX = "CL_"

CHECKPOINT_FIELDS: dict[str, tuple[str, ...]] = {
    "switch": ("_items",),
    "condition": ("_items",),
    "dice": ("_resultItems",),
    "position": ("_scriptPrefix", "_list"),
    "flag": (),
}

STAT_FIELDS: tuple[str, ...] = ("m_Name", "_type", "_name")
LORE_CLASS = "StoryData"
LORE_FIELDS: tuple[str, ...] = ("_text",)

HARDCODED_ENTRIES: tuple[dict[str, str], ...] = (
    {"id": "ch1_1", "label": "New game start", "origin": "SaveSystem new game"},
    {"id": "act1", "label": "New act start", "origin": "SaveSystem new act"},
)

VALUE_FIELD_BY_KIND: dict[str, str] = {
    VALUE_STAT: "_stat",
    VALUE_REL: "_relationship",
    VALUE_FLAG: "_flag",
    VALUE_BOOK: "_book",
    VALUE_MISC: "_misc",
    VALUE_SPECIAL: "_specialItem",
    VALUE_GROUP: "_statGroup",
    VALUE_TIME: "_gameTime",
    VALUE_TALENT: "_talentData",
    VALUE_BOOK_LEVEL: "_book",
    VALUE_UPGRADE: "_upgradeItemData",
    VALUE_UPGRADE_LEVEL: "_upgradeItemData",
    VALUE_BOOK_MASTER: "_bookCollection",
    VALUE_CHRONICLE: "_libraryAchieve",
    VALUE_CONDITION: "_condition",
}

DICE_FIELD_BY_KIND: dict[str, str] = {
    VALUE_STAT: "_stat",
    VALUE_REL: "_relationship",
    VALUE_TALENT: "_talent",
    VALUE_FLAG: "_flag",
}

DICE_NAME_KINDS: dict[int, str] = {
    0: VALUE_STAT,
    1: VALUE_REL,
    2: VALUE_TALENT,
    3: VALUE_FLAG,
}
