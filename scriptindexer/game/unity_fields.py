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
