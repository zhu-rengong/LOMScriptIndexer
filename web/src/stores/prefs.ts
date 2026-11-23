import {
  FOLLOW_BASE,
  FOLLOW_GROUP,
  baseFontStack,
  fontLabelKey,
  fontStackOf,
} from "../lib/fontFamilies";
import { TYPE_SLOTS, slotById } from "../lib/fontTypes";
import type { PrefsSnapshot } from "../lib/prefsDom";
import {
  PREFS_DEFAULTS,
  PREFS_LIMITS,
  decodePrefs,
  defaultPrefs,
  normalizeBaseFont,
  normalizeCaps,
  normalizeFlag,
  normalizeLeading,
  normalizeMeasure,
  normalizePortraitSize,
  normalizeReaderZoom,
  normalizeScale,
  normalizeTheme,
  normalizeTracking,
  normalizeWeight,
  type StoredPrefs,
} from "../lib/prefsSchema";
import { keys, storedRef } from "../lib/storage";
import type {
  FontScope,
  FontTarget,
  PrefEntry,
  PrefPatch,
  PrefState,
  ResolvedTypeStyle,
  ThemeMode,
} from "../types/font";

const BASE_SIZE = 16;
const BASE_LEADING = 1.6;
const BASE_WEIGHT = 400;

const WEIGHTS = PREFS_DEFAULTS.weights;

const LABELS = {
  followBase: "pref.followBase",
  followGroup: "pref.followGroup",
  groupAll: "pref.groupAll",
};

const PRESETS = { weights: WEIGHTS.slice() };

const LIMITS = PREFS_LIMITS;

const patchEntry = (current: PrefEntry, next: Partial<PrefEntry>, slotScope: boolean): void => {
  if (typeof next.font === "string") current.font = next.font;
  if (next.scale !== undefined) current.scale = normalizeScale(next.scale, current.scale);
  if (next.leading !== undefined) {
    current.leading = normalizeLeading(next.leading, current.leading);
  }
  if (next.tracking !== undefined) {
    current.tracking = normalizeTracking(next.tracking, current.tracking);
  }
  if (next.weight !== undefined) {
    current.weight =
      next.weight === null && slotScope ? null : normalizeWeight(next.weight, current.weight);
  }
  if (next.italic !== undefined) {
    current.italic =
      next.italic === null && slotScope ? null : normalizeFlag(next.italic, current.italic);
  }
  if (next.caps !== undefined) {
    current.caps = next.caps === null && slotScope ? null : normalizeCaps(next.caps, current.caps);
  }
  if (next.numeric !== undefined) {
    current.numeric =
      next.numeric === null && slotScope ? null : normalizeFlag(next.numeric, current.numeric);
  }
};

export const usePrefsStore = defineStore("prefs", () => {
  const state = storedRef<StoredPrefs>(keys.prefs, defaultPrefs(), { decode: decodePrefs });
  const view = useViewStore(pinia);

  const baseFont = computed({
    get: () => state.value.baseFont,
    set: (value: string) => {
      state.value.baseFont = normalizeBaseFont(value);
    },
  });
  const theme = computed({
    get: () => state.value.theme,
    set: (value: ThemeMode) => {
      state.value.theme = normalizeTheme(value, state.value.theme);
    },
  });
  const baseStack = computed(() => baseFontStack(baseFont.value));
  const groups = computed(() => state.value.groups);
  const slots = computed(() => state.value.slots);
  const measure = computed({
    get: () => state.value.measure,
    set: (value: number) => {
      state.value.measure = normalizeMeasure(value, state.value.measure);
    },
  });
  const showPortraits = computed({
    get: () => state.value.showPortraits,
    set: (value: boolean) => {
      state.value.showPortraits = value;
    },
  });
  const portraitSize = computed({
    get: () => state.value.portraitSize,
    set: (value: number) => {
      state.value.portraitSize = normalizePortraitSize(value, state.value.portraitSize);
    },
  });
  const readerZoom = computed({
    get: () =>
      state.value.readerZoom === 0 ? (view.sheetMode ? 75 : 100) : state.value.readerZoom,
    set: (value: number) => {
      state.value.readerZoom = normalizeReaderZoom(value, 100);
    },
  });

  const groupStack = (groupId: string): string =>
    fontStackOf(groups.value[groupId]?.font || FOLLOW_BASE, baseStack.value);

  const slotStack = (slotId: string): string => {
    const slot = slotById(slotId);
    if (!slot) return baseStack.value;
    const entry = slots.value[slotId];
    if (!entry || !entry.font || entry.font === FOLLOW_GROUP) return groupStack(slot.group);
    return fontStackOf(entry.font, baseStack.value);
  };

  const groupStyle = (id: string): ResolvedTypeStyle | null => {
    const group = groups.value[id];
    if (!group) return null;
    return {
      scope: "group",
      id,
      group: id,
      px: BASE_SIZE * (group.scale / 100),
      lineHeight: BASE_LEADING * (group.leading / 100),
      tracking: group.tracking,
      weight: group.weight ?? BASE_WEIGHT,
      italic: group.italic ?? false,
      caps: group.caps ?? "none",
      numeric: group.numeric ?? false,
      font: group.font,
      fontStack: groupStack(id),
    };
  };

  const slotStyle = (id: string): ResolvedTypeStyle | null => {
    const slot = slotById(id);
    if (!slot) return null;
    const entry = slots.value[id];
    const group = groups.value[slot.group];
    if (!entry || !group) return null;
    return {
      scope: "slot",
      id,
      group: slot.group,
      px: BASE_SIZE * (group.scale / 100) * (entry.scale / 100),
      lineHeight: BASE_LEADING * (group.leading / 100) * (entry.leading / 100),
      tracking: group.tracking + entry.tracking,
      weight: entry.weight ?? group.weight ?? BASE_WEIGHT,
      italic: entry.italic ?? group.italic ?? false,
      caps: entry.caps ?? group.caps ?? "none",
      numeric: entry.numeric ?? group.numeric ?? false,
      font: entry.font,
      fontStack: slotStack(id),
    };
  };

  const resolveEntry = (scope: FontScope, id: string): ResolvedTypeStyle | null => {
    if (scope === "base") return null;
    return scope === "group" ? groupStyle(id) : slotStyle(id);
  };

  const snapshot = computed<PrefsSnapshot>(() => ({
    baseStack: baseStack.value,
    measure: measure.value,
    portraitSize: portraitSize.value,
    readerZoom: readerZoom.value,
    theme: state.value.theme,
    slots: TYPE_SLOTS.map((slot) => slotStyle(slot.id)).filter(
      (style): style is ResolvedTypeStyle => style !== null,
    ),
  }));

  const get = (): PrefState => ({
    theme: state.value.theme,
    baseFont: state.value.baseFont,
    groups: state.value.groups,
    slots: state.value.slots,
    measure: state.value.measure,
    showPortraits: state.value.showPortraits,
    portraitSize: state.value.portraitSize,
    readerZoom: state.value.readerZoom,
  });

  const set = (patch: PrefPatch): PrefState => {
    if (patch && typeof patch === "object") {
      if (patch.theme !== undefined) theme.value = patch.theme;
      if (typeof patch.baseFont === "string") baseFont.value = patch.baseFont;
      if (typeof patch.showPortraits === "boolean") showPortraits.value = patch.showPortraits;
      if (patch.portraitSize !== undefined) portraitSize.value = patch.portraitSize;
      if (patch.readerZoom !== undefined) readerZoom.value = patch.readerZoom;
      if (patch.measure !== undefined) measure.value = patch.measure;
      if (patch.groups && typeof patch.groups === "object") {
        for (const groupId of Object.keys(patch.groups)) {
          const current = state.value.groups[groupId];
          if (!current) continue;
          patchEntry(current, patch.groups[groupId] || {}, false);
        }
      }
      if (patch.slots && typeof patch.slots === "object") {
        for (const slotId of Object.keys(patch.slots)) {
          const current = state.value.slots[slotId];
          if (!current) continue;
          patchEntry(current, patch.slots[slotId] || {}, true);
        }
      }
    }
    return get();
  };

  const reset = (): PrefState => {
    state.value = defaultPrefs();
    return get();
  };

  const fontLabelKeyOf = (target: FontTarget): string => {
    if (target.scope === "base") return fontLabelKey(state.value.baseFont);
    if (target.scope === "group") {
      return fontLabelKey(groups.value[target.id]?.font || FOLLOW_BASE);
    }
    return fontLabelKey(slots.value[target.id]?.font || FOLLOW_GROUP);
  };

  return {
    labels: LABELS,
    presets: PRESETS,
    limits: LIMITS,
    theme,
    baseFont,
    groups,
    slots,
    measure,
    showPortraits,
    portraitSize,
    readerZoom,
    snapshot,
    resolveEntry,
    get,
    set,
    reset,
    fontLabelKeyOf,
  };
});
