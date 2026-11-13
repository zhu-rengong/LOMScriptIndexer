import { defineStore } from "pinia";
import {
  BASE_FONT,
  FONTS,
  FOLLOW_BASE,
  FOLLOW_GROUP,
  fontLabelKey,
  fontPreset,
  fontStackOf,
} from "../lib/fontFamilies";
import { GROUPS, TYPE_SLOTS, slotById } from "../lib/fontTypes";
import { keys, readJson, writeJson } from "../lib/storage";
import type {
  FontScope,
  FontTarget,
  PrefEntry,
  PrefPatch,
  PrefState,
  ResolvedTypeStyle,
} from "../types/font";

const KEY = keys.prefs;

const BASE_SIZE = 16;
const BASE_LEADING = 1.6;
const BASE_WEIGHT = 400;

const WEIGHTS = [400, 500, 600];

const MEASURE_MIN = 520;
const MEASURE_MAX = 1400;
const MEASURE_DEFAULT = 860;
const SCALE_MIN = 25;
const SCALE_MAX = 300;
const SCALE_STEP = 5;
const LEADING_MIN = 50;
const LEADING_MAX = 250;
const LEADING_STEP = 5;
const PORTRAIT_SIZE_MIN = 24;
const PORTRAIT_SIZE_MAX = 80;
const PORTRAIT_SIZE_STEP = 4;
const PORTRAIT_SIZE_DEFAULT = 56;

const GROUP_DEFAULT = { scale: 100, leading: 100, weight: BASE_WEIGHT };
const SLOT_DEFAULT = { scale: 100, leading: 100, weight: null as number | null };

const LABELS = {
  followBase: "pref.followBase",
  followGroup: "pref.followGroup",
  groupAll: "pref.groupAll",
  customFont: "pref.customFont",
};

const PRESETS = {
  fonts: FONTS,
  groups: GROUPS,
  slots: TYPE_SLOTS,
  weights: WEIGHTS.slice(),
};

const LIMITS = {
  measure: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
  scale: { min: SCALE_MIN, max: SCALE_MAX, step: SCALE_STEP },
  leading: { min: LEADING_MIN, max: LEADING_MAX, step: LEADING_STEP },
  portraitSize: {
    min: PORTRAIT_SIZE_MIN,
    max: PORTRAIT_SIZE_MAX,
    step: PORTRAIT_SIZE_STEP,
    fallback: PORTRAIT_SIZE_DEFAULT,
  },
};

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};

const clampScale = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, SCALE_MIN, SCALE_MAX, fallback) / SCALE_STEP) * SCALE_STEP;

const clampLeading = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, LEADING_MIN, LEADING_MAX, fallback) / LEADING_STEP) * LEADING_STEP;

const clampPortraitSize = (value: unknown, fallback: number): number =>
  Math.round(
    clampNumber(value, PORTRAIT_SIZE_MIN, PORTRAIT_SIZE_MAX, fallback) / PORTRAIT_SIZE_STEP,
  ) * PORTRAIT_SIZE_STEP;

const clampWeight = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return fallback;
  const weight = Number(value);
  return WEIGHTS.indexOf(weight) >= 0 ? weight : fallback;
};

const defaultGroups = (): Record<string, PrefEntry> => {
  const out: Record<string, PrefEntry> = {};
  for (const group of GROUPS) {
    out[group.id] = {
      font: group.font || FOLLOW_BASE,
      scale: typeof group.scale === "number" ? group.scale : GROUP_DEFAULT.scale,
      leading: GROUP_DEFAULT.leading,
      weight: GROUP_DEFAULT.weight,
    };
  }
  return out;
};

const defaultSlots = (): Record<string, PrefEntry> => {
  const out: Record<string, PrefEntry> = {};
  for (const slot of TYPE_SLOTS) {
    out[slot.id] = {
      font: slot.font,
      scale: typeof slot.scale === "number" ? slot.scale : SLOT_DEFAULT.scale,
      leading: typeof slot.leading === "number" ? slot.leading : SLOT_DEFAULT.leading,
      weight: slot.weight,
    };
  }
  return out;
};

const normalizeEntry = (
  raw: unknown,
  base: PrefEntry,
  fallbackWeight: number | null,
): PrefEntry => {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    font: typeof item.font === "string" ? item.font : base.font,
    scale: clampScale(item.scale, base.scale),
    leading: clampLeading(item.leading, base.leading),
    weight: clampWeight(item.weight === undefined ? fallbackWeight : item.weight, fallbackWeight),
  };
};

export const usePrefsStore = defineStore("prefs", () => {
  const groups = ref<Record<string, PrefEntry>>(defaultGroups());
  const slots = ref<Record<string, PrefEntry>>(defaultSlots());
  const measure = ref(MEASURE_DEFAULT);
  const showPortraits = ref(true);
  const portraitSize = ref(PORTRAIT_SIZE_DEFAULT);
  const customFontOpen = ref(false);

  const groupStack = (groupId: string): string =>
    fontStackOf((groups.value[groupId] || GROUP_DEFAULT).font);

  const slotStack = (slotId: string): string => {
    const slot = slotById(slotId);
    if (!slot) return BASE_FONT;
    const entry = slots.value[slotId];
    if (!entry || !entry.font || entry.font === FOLLOW_GROUP) return groupStack(slot.group);
    return fontStackOf(entry.font);
  };

  const resolveWeight = (slotId: string): number | null => {
    const slot = slotById(slotId);
    if (!slot) return BASE_WEIGHT;
    const entry = slots.value[slotId];
    const group = groups.value[slot.group];
    if (entry && entry.weight !== null && entry.weight !== undefined) return entry.weight;
    if (group && group.weight !== null && group.weight !== undefined) return group.weight;
    return BASE_WEIGHT;
  };

  const resolveEntry = (scope: FontScope, id: string): ResolvedTypeStyle | null => {
    if (scope === "group") {
      const group = groups.value[id];
      if (!group) return null;
      return {
        scope: "group",
        id,
        group: id,
        scale: group.scale,
        leading: group.leading,
        px: BASE_SIZE * (group.scale / 100),
        lineHeight: BASE_LEADING * (group.leading / 100),
        weight: group.weight,
        font: group.font,
        fontStack: groupStack(id),
      };
    }
    const slot = slotById(id);
    if (!slot) return null;
    const entry = slots.value[id];
    const group = groups.value[slot.group];
    if (!entry || !group) return null;
    return {
      scope: "slot",
      id,
      group: slot.group,
      scale: entry.scale,
      leading: entry.leading,
      px: BASE_SIZE * (group.scale / 100) * (entry.scale / 100),
      lineHeight: BASE_LEADING * (group.leading / 100) * (entry.leading / 100),
      weight: resolveWeight(id),
      font: entry.font,
      fontStack: slotStack(id),
    };
  };

  const applyToDocument = (): void => {
    const root = document.documentElement;
    root.style.setProperty("--font-base", BASE_FONT);
    root.style.setProperty("--reader-measure", `${measure.value}px`);
    root.style.setProperty("--rd-portrait-w", `${portraitSize.value}px`);
    for (const slot of TYPE_SLOTS) {
      const entry = resolveEntry("slot", slot.id);
      if (!entry) continue;
      root.style.setProperty(`--rd-fs-${slot.id}`, `${entry.px.toFixed(2)}px`);
      root.style.setProperty(`--rd-lh-${slot.id}`, entry.lineHeight.toFixed(3));
      root.style.setProperty(`--rd-fw-${slot.id}`, String(entry.weight));
      root.style.setProperty(`--rd-ff-${slot.id}`, entry.fontStack);
    }
  };

  const persist = (): void => {
    writeJson(KEY, {
      groups: groups.value,
      slots: slots.value,
      measure: measure.value,
      showPortraits: showPortraits.value,
      portraitSize: portraitSize.value,
    });
  };

  const get = (): PrefState => ({
    groups: groups.value,
    slots: slots.value,
    measure: measure.value,
    showPortraits: showPortraits.value,
    portraitSize: portraitSize.value,
  });

  const resetDefaults = (): void => {
    groups.value = defaultGroups();
    slots.value = defaultSlots();
    measure.value = MEASURE_DEFAULT;
    showPortraits.value = true;
    portraitSize.value = PORTRAIT_SIZE_DEFAULT;
  };

  const restoreFromStorage = (): void => {
    resetDefaults();
    const saved = readJson<Partial<PrefState>>(KEY);
    const source = saved && typeof saved === "object" ? saved : null;
    if (!source) return;
    measure.value = Math.round(
      clampNumber(source.measure, MEASURE_MIN, MEASURE_MAX, MEASURE_DEFAULT),
    );
    showPortraits.value = source.showPortraits !== false;
    portraitSize.value = clampPortraitSize(source.portraitSize, PORTRAIT_SIZE_DEFAULT);
    const storedGroups = source.groups && typeof source.groups === "object" ? source.groups : null;
    if (storedGroups) {
      for (const group of GROUPS) {
        groups.value[group.id] = normalizeEntry(
          storedGroups[group.id],
          groups.value[group.id],
          GROUP_DEFAULT.weight,
        );
      }
    }
    const storedSlots = source.slots && typeof source.slots === "object" ? source.slots : null;
    if (storedSlots) {
      for (const slot of TYPE_SLOTS) {
        slots.value[slot.id] = normalizeEntry(storedSlots[slot.id], slots.value[slot.id], null);
      }
    }
  };

  const set = (patch: PrefPatch): PrefState => {
    if (patch && typeof patch === "object") {
      if (typeof patch.showPortraits === "boolean") showPortraits.value = patch.showPortraits;
      if (patch.portraitSize !== undefined) {
        portraitSize.value = clampPortraitSize(patch.portraitSize, portraitSize.value);
      }
      if (patch.measure !== undefined) {
        measure.value = Math.round(
          clampNumber(patch.measure, MEASURE_MIN, MEASURE_MAX, measure.value),
        );
      }
      if (patch.groups && typeof patch.groups === "object") {
        for (const groupId of Object.keys(patch.groups)) {
          const current = groups.value[groupId];
          if (!current) continue;
          const next = patch.groups[groupId] || {};
          if (typeof next.font === "string") current.font = next.font;
          if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
          if (next.leading !== undefined) {
            current.leading = clampLeading(next.leading, current.leading);
          }
          if (next.weight !== undefined) {
            current.weight = clampWeight(next.weight, current.weight);
          }
        }
      }
      if (patch.slots && typeof patch.slots === "object") {
        for (const slotId of Object.keys(patch.slots)) {
          const current = slots.value[slotId];
          if (!current) continue;
          const next = patch.slots[slotId] || {};
          if (typeof next.font === "string") current.font = next.font;
          if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
          if (next.leading !== undefined) {
            current.leading = clampLeading(next.leading, current.leading);
          }
          if (next.weight !== undefined) {
            current.weight = next.weight === null ? null : clampWeight(next.weight, current.weight);
          }
        }
      }
    }
    applyToDocument();
    persist();
    return get();
  };

  const reset = (): PrefState => {
    resetDefaults();
    applyToDocument();
    persist();
    return get();
  };

  const fontLabelKeyOf = (target: FontTarget): string => {
    if (target.scope === "group") {
      const group = groups.value[target.id];
      return fontLabelKey(group ? group.font : FOLLOW_BASE);
    }
    const entry = slots.value[target.id];
    return fontLabelKey(entry ? entry.font : FOLLOW_GROUP);
  };

  const isCustomFont = (value: string): boolean =>
    !!value && value !== FOLLOW_BASE && value !== FOLLOW_GROUP && !fontPreset(value);

  restoreFromStorage();
  applyToDocument();

  return {
    labels: LABELS,
    presets: PRESETS,
    limits: LIMITS,
    groups,
    slots,
    measure,
    showPortraits,
    portraitSize,
    customFontOpen,
    resolveEntry,
    get,
    set,
    reset,
    fontLabelKeyOf,
    isCustomFont,
  };
});
