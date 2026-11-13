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
  CapsMode,
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
const BASE_TRACKING = 0;

const WEIGHTS = [300, 400, 500, 600, 700, 800];

const CAPS: CapsMode[] = ["none", "upper", "small"];

const MEASURE_MIN = 520;
const MEASURE_MAX = 1400;
const MEASURE_DEFAULT = 860;
const SCALE_MIN = 25;
const SCALE_MAX = 300;
const SCALE_STEP = 5;
const LEADING_MIN = 50;
const LEADING_MAX = 250;
const LEADING_STEP = 5;
const TRACKING_MIN = -0.05;
const TRACKING_MAX = 0.5;
const TRACKING_STEP = 0.01;
const PORTRAIT_SIZE_MIN = 24;
const PORTRAIT_SIZE_MAX = 80;
const PORTRAIT_SIZE_STEP = 4;
const PORTRAIT_SIZE_DEFAULT = 56;

const GROUP_DEFAULT = {
  scale: 100,
  leading: 100,
  tracking: BASE_TRACKING,
  weight: BASE_WEIGHT,
  italic: false,
  caps: "none" as CapsMode,
  numeric: false,
};

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
  caps: CAPS.slice(),
};

const LIMITS = {
  measure: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
  scale: { min: SCALE_MIN, max: SCALE_MAX, step: SCALE_STEP },
  leading: { min: LEADING_MIN, max: LEADING_MAX, step: LEADING_STEP },
  tracking: { min: TRACKING_MIN, max: TRACKING_MAX, step: TRACKING_STEP },
  weight: { min: WEIGHTS[0], max: WEIGHTS[WEIGHTS.length - 1], step: 100 },
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

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const clampScale = (value: unknown, fallback: number): number =>
  roundTo(clampNumber(value, SCALE_MIN, SCALE_MAX, fallback), SCALE_STEP);

const clampLeading = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, LEADING_MIN, LEADING_MAX, fallback) * 10) / 10;

const clampTracking = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, TRACKING_MIN, TRACKING_MAX, fallback) * 100) / 100;

const clampWeight = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return fallback;
  const weight = Number(value);
  if (!Number.isFinite(weight)) return fallback;
  const nearest = WEIGHTS.reduce((best, item) =>
    Math.abs(item - weight) < Math.abs(best - weight) ? item : best,
  );
  return nearest;
};

const clampCaps = (value: unknown, fallback: CapsMode | null): CapsMode | null => {
  if (value === null) return fallback;
  return CAPS.indexOf(String(value) as CapsMode) >= 0 ? (value as CapsMode) : fallback;
};

const clampBool = (value: unknown, fallback: boolean | null): boolean | null => {
  if (value === null) return fallback;
  return typeof value === "boolean" ? value : fallback;
};

const clampPortraitSize = (value: unknown, fallback: number): number =>
  roundTo(clampNumber(value, PORTRAIT_SIZE_MIN, PORTRAIT_SIZE_MAX, fallback), PORTRAIT_SIZE_STEP);

const defaultGroups = (): Record<string, PrefEntry> => {
  const out: Record<string, PrefEntry> = {};
  for (const group of GROUPS) {
    out[group.id] = {
      font: group.font || FOLLOW_BASE,
      scale: group.scale ?? GROUP_DEFAULT.scale,
      leading: group.leading ?? GROUP_DEFAULT.leading,
      tracking: group.tracking ?? GROUP_DEFAULT.tracking,
      weight: group.weight ?? GROUP_DEFAULT.weight,
      italic: group.italic ?? GROUP_DEFAULT.italic,
      caps: group.caps ?? GROUP_DEFAULT.caps,
      numeric: group.numeric ?? GROUP_DEFAULT.numeric,
    };
  }
  return out;
};

const defaultSlots = (): Record<string, PrefEntry> => {
  const out: Record<string, PrefEntry> = {};
  for (const slot of TYPE_SLOTS) {
    out[slot.id] = {
      font: slot.font,
      scale: slot.scale,
      leading: slot.leading,
      tracking: slot.tracking,
      weight: slot.weight,
      italic: slot.italic,
      caps: slot.caps,
      numeric: slot.numeric,
    };
  }
  return out;
};

const normalizeGroup = (raw: unknown, base: PrefEntry): PrefEntry => {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    font: typeof item.font === "string" ? item.font : base.font,
    scale: clampScale(item.scale, base.scale),
    leading: clampLeading(item.leading, base.leading),
    tracking: clampTracking(item.tracking, base.tracking),
    weight: clampWeight(item.weight === undefined ? base.weight : item.weight, base.weight),
    italic: clampBool(item.italic === undefined ? base.italic : item.italic, base.italic),
    caps: clampCaps(item.caps === undefined ? base.caps : item.caps, base.caps),
    numeric: clampBool(item.numeric === undefined ? base.numeric : item.numeric, base.numeric),
  };
};

const normalizeSlot = (raw: unknown, base: PrefEntry): PrefEntry => {
  const item = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const weight = item.weight === undefined ? base.weight : item.weight;
  const italic = item.italic === undefined ? base.italic : item.italic;
  const caps = item.caps === undefined ? base.caps : item.caps;
  const numeric = item.numeric === undefined ? base.numeric : item.numeric;
  return {
    font: typeof item.font === "string" ? item.font : base.font,
    scale: clampScale(item.scale, base.scale),
    leading: clampLeading(item.leading, base.leading),
    tracking: clampTracking(item.tracking, base.tracking),
    weight: weight === null ? null : clampWeight(weight, base.weight),
    italic: italic === null ? null : clampBool(italic, base.italic),
    caps: caps === null ? null : clampCaps(caps, base.caps),
    numeric: numeric === null ? null : clampBool(numeric, base.numeric),
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

  const resolveEntry = (scope: FontScope, id: string): ResolvedTypeStyle | null =>
    scope === "group" ? groupStyle(id) : slotStyle(id);

  const capsTokens = (caps: CapsMode): [string, string] => {
    if (caps === "upper") return ["uppercase", "normal"];
    if (caps === "small") return ["none", "small-caps"];
    return ["none", "normal"];
  };

  const applyToDocument = (): void => {
    const root = document.documentElement;
    root.style.setProperty("--font-base", BASE_FONT);
    root.style.setProperty("--reader-measure", `${measure.value}px`);
    root.style.setProperty("--rd-portrait-w", `${portraitSize.value}px`);
    for (const slot of TYPE_SLOTS) {
      const style = slotStyle(slot.id);
      if (!style) continue;
      const [transform, variant] = capsTokens(style.caps);
      root.style.setProperty(`--rd-ff-${slot.id}`, style.fontStack);
      root.style.setProperty(`--rd-fs-${slot.id}`, `${style.px.toFixed(2)}px`);
      root.style.setProperty(`--rd-lh-${slot.id}`, style.lineHeight.toFixed(3));
      root.style.setProperty(`--rd-fw-${slot.id}`, String(style.weight));
      root.style.setProperty(`--rd-ls-${slot.id}`, `${style.tracking.toFixed(3)}em`);
      root.style.setProperty(`--rd-fi-${slot.id}`, style.italic ? "italic" : "normal");
      root.style.setProperty(`--rd-tt-${slot.id}`, transform);
      root.style.setProperty(`--rd-fc-${slot.id}`, variant);
      root.style.setProperty(`--rd-fn-${slot.id}`, style.numeric ? "tabular-nums" : "normal");
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

  let frame = 0;

  const flush = (): void => {
    frame = 0;
    applyToDocument();
    persist();
  };

  const schedule = (): void => {
    if (frame) return;
    frame = requestAnimationFrame(flush);
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
        groups.value[group.id] = normalizeGroup(storedGroups[group.id], groups.value[group.id]);
      }
    }
    const storedSlots = source.slots && typeof source.slots === "object" ? source.slots : null;
    if (storedSlots) {
      for (const slot of TYPE_SLOTS) {
        slots.value[slot.id] = normalizeSlot(storedSlots[slot.id], slots.value[slot.id]);
      }
    }
  };

  const patchEntry = (current: PrefEntry, next: Partial<PrefEntry>, slotScope: boolean): void => {
    if (typeof next.font === "string") current.font = next.font;
    if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
    if (next.leading !== undefined) current.leading = clampLeading(next.leading, current.leading);
    if (next.tracking !== undefined) {
      current.tracking = clampTracking(next.tracking, current.tracking);
    }
    if (next.weight !== undefined) {
      current.weight =
        next.weight === null && slotScope ? null : clampWeight(next.weight, current.weight);
    }
    if (next.italic !== undefined) {
      current.italic =
        next.italic === null && slotScope ? null : clampBool(next.italic, current.italic);
    }
    if (next.caps !== undefined) {
      current.caps = next.caps === null && slotScope ? null : clampCaps(next.caps, current.caps);
    }
    if (next.numeric !== undefined) {
      current.numeric =
        next.numeric === null && slotScope ? null : clampBool(next.numeric, current.numeric);
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
          patchEntry(current, patch.groups[groupId] || {}, false);
        }
      }
      if (patch.slots && typeof patch.slots === "object") {
        for (const slotId of Object.keys(patch.slots)) {
          const current = slots.value[slotId];
          if (!current) continue;
          patchEntry(current, patch.slots[slotId] || {}, true);
        }
      }
    }
    schedule();
    return get();
  };

  const reset = (): PrefState => {
    resetDefaults();
    schedule();
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
