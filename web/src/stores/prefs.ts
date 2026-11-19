import { usePreferredDark } from "@vueuse/core";
import { defineStore } from "pinia";
import {
  DEFAULT_BASE_FONT,
  FOLLOW_BASE,
  FOLLOW_GROUP,
  baseFontStack,
  fontLabelKey,
  fontStackOf,
} from "../lib/fontFamilies";
import { TYPE_SLOTS, slotById } from "../lib/fontTypes";
import {
  PREFS_DEFAULTS,
  PREFS_LIMITS,
  decodePrefs,
  defaultPrefs,
  type StoredPrefs,
} from "../lib/prefsSchema";
import { keys, storedRef } from "../lib/storage";
import type {
  CapsMode,
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
const CAPS = PREFS_DEFAULTS.caps;
const THEMES = PREFS_DEFAULTS.themes;

const LABELS = {
  followBase: "pref.followBase",
  followGroup: "pref.followGroup",
  groupAll: "pref.groupAll",
};

const PRESETS = { weights: WEIGHTS.slice() };

const LIMITS = PREFS_LIMITS;

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
};

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const clampScale = (value: unknown, fallback: number): number =>
  roundTo(clampNumber(value, LIMITS.scale.min, LIMITS.scale.max, fallback), LIMITS.scale.step);

const clampLeading = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, LIMITS.leading.min, LIMITS.leading.max, fallback) * 10) / 10;

const clampTracking = (value: unknown, fallback: number): number =>
  Math.round(clampNumber(value, LIMITS.tracking.min, LIMITS.tracking.max, fallback) * 100) / 100;

const clampWeight = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return fallback;
  const weight = Number(value);
  if (!Number.isFinite(weight)) return fallback;
  return WEIGHTS.reduce((best, item) =>
    Math.abs(item - weight) < Math.abs(best - weight) ? item : best,
  );
};

const clampCaps = (value: unknown, fallback: CapsMode | null): CapsMode | null => {
  if (value === null) return fallback;
  return CAPS.indexOf(String(value) as CapsMode) >= 0 ? (value as CapsMode) : fallback;
};

const clampTheme = (value: unknown, fallback: ThemeMode): ThemeMode =>
  THEMES.indexOf(String(value) as ThemeMode) >= 0 ? (value as ThemeMode) : fallback;

const clampBool = (value: unknown, fallback: boolean | null): boolean | null => {
  if (value === null) return fallback;
  return typeof value === "boolean" ? value : fallback;
};

const normalizeBaseFont = (value: unknown): string => {
  const font = typeof value === "string" ? value.trim() : "";
  return font && font !== FOLLOW_BASE && font !== FOLLOW_GROUP ? font : DEFAULT_BASE_FONT;
};

const patchEntry = (current: PrefEntry, next: Partial<PrefEntry>, slotScope: boolean): void => {
  if (typeof next.font === "string") current.font = next.font;
  if (next.scale !== undefined) current.scale = clampScale(next.scale, current.scale);
  if (next.leading !== undefined) current.leading = clampLeading(next.leading, current.leading);
  if (next.tracking !== undefined)
    current.tracking = clampTracking(next.tracking, current.tracking);
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

export const usePrefsStore = defineStore("prefs", () => {
  const state = storedRef<StoredPrefs>(keys.prefs, defaultPrefs(), { decode: decodePrefs });

  const baseFont = computed({
    get: () => state.value.baseFont,
    set: (value: string) => {
      state.value.baseFont = normalizeBaseFont(value);
    },
  });
  const theme = computed({
    get: () => state.value.theme,
    set: (value: ThemeMode) => {
      state.value.theme = clampTheme(value, state.value.theme);
    },
  });
  const baseStack = computed(() => baseFontStack(baseFont.value));
  const groups = computed(() => state.value.groups);
  const slots = computed(() => state.value.slots);
  const measure = computed({
    get: () => state.value.measure,
    set: (value: number) => {
      state.value.measure = Math.round(
        clampNumber(value, LIMITS.measure.min, LIMITS.measure.max, state.value.measure),
      );
    },
  });
  const showPortraits = computed({
    get: () => state.value.showPortraits,
    set: (value: boolean) => {
      state.value.showPortraits = !!value;
    },
  });
  const portraitSize = computed({
    get: () => state.value.portraitSize,
    set: (value: number) => {
      state.value.portraitSize = roundTo(
        clampNumber(
          value,
          LIMITS.portraitSize.min,
          LIMITS.portraitSize.max,
          state.value.portraitSize,
        ),
        LIMITS.portraitSize.step,
      );
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

  const capsTokens = (caps: CapsMode): [string, string] => {
    if (caps === "upper") return ["uppercase", "normal"];
    if (caps === "small") return ["none", "small-caps"];
    return ["none", "normal"];
  };

  const applyToDocument = (): void => {
    const root = document.documentElement;
    root.style.setProperty("--font-base", baseStack.value);
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

  watch(state, applyToDocument, { deep: true, flush: "post", immediate: true });

  const preferredDark = usePreferredDark();

  const applyTheme = (): void => {
    const mode = state.value.theme;
    const dark = mode === "dark" || (mode === "system" && preferredDark.value);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  };

  watch([() => state.value.theme, preferredDark], applyTheme, { immediate: true, flush: "post" });

  const get = (): PrefState => ({
    theme: state.value.theme,
    baseFont: state.value.baseFont,
    groups: state.value.groups,
    slots: state.value.slots,
    measure: state.value.measure,
    showPortraits: state.value.showPortraits,
    portraitSize: state.value.portraitSize,
  });

  const set = (patch: PrefPatch): PrefState => {
    if (patch && typeof patch === "object") {
      if (patch.theme !== undefined) theme.value = patch.theme;
      if (typeof patch.baseFont === "string") baseFont.value = patch.baseFont;
      if (typeof patch.showPortraits === "boolean") showPortraits.value = patch.showPortraits;
      if (patch.portraitSize !== undefined) portraitSize.value = patch.portraitSize;
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
    resolveEntry,
    get,
    set,
    reset,
    fontLabelKeyOf,
  };
});
