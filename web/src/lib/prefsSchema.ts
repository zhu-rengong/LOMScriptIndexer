import * as v from "valibot";
import { FOLLOW_BASE, FOLLOW_GROUP } from "./fontFamilies";
import { GROUPS, TYPE_SLOTS } from "./fontTypes";
import type { CapsMode, PrefEntry, PrefState, ThemeMode } from "../types/font";

export const PREFS_VERSION = 13;

const CAPS: CapsMode[] = ["none", "upper", "small"];
const THEMES: ThemeMode[] = ["light", "dark", "system"];
const WEIGHTS = [300, 400, 500, 600, 700, 800];
const DEFAULT_BASE_FONT = "serif";

const MEASURE_MIN = 520;
const MEASURE_MAX = 1400;
const MEASURE_DEFAULT = 860;
const SCALE_MIN = 25;
const SCALE_MAX = 300;
const SCALE_STEP = 5;
const LEADING_MIN = 50;
const LEADING_MAX = 250;
const TRACKING_MIN = -0.05;
const TRACKING_MAX = 0.5;
const PORTRAIT_SIZE_MIN = 60;
const PORTRAIT_SIZE_MAX = 100;
const PORTRAIT_SIZE_STEP = 4;
const PORTRAIT_SIZE_DEFAULT = 80;
const ZOOM_MIN = 50;
const ZOOM_MAX = 150;
const ZOOM_STEP = 5;

const clampValue = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const numberOrNull = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const scaleValue = (value: number): number =>
  roundTo(clampValue(value, SCALE_MIN, SCALE_MAX), SCALE_STEP);

const leadingValue = (value: number): number =>
  Math.round(clampValue(value, LEADING_MIN, LEADING_MAX) * 10) / 10;

const trackingValue = (value: number): number =>
  Math.round(clampValue(value, TRACKING_MIN, TRACKING_MAX) * 100) / 100;

const weightValue = (value: number): number =>
  WEIGHTS.reduce((best, item) => (Math.abs(item - value) < Math.abs(best - value) ? item : best));

const measureValue = (value: number): number =>
  Math.round(clampValue(value, MEASURE_MIN, MEASURE_MAX));

const portraitSizeValue = (value: number): number =>
  roundTo(clampValue(value, PORTRAIT_SIZE_MIN, PORTRAIT_SIZE_MAX), PORTRAIT_SIZE_STEP);

const readerZoomValue = (value: number): number =>
  value === 0 ? 0 : roundTo(clampValue(value, ZOOM_MIN, ZOOM_MAX), ZOOM_STEP);

const isCaps = (value: unknown): value is CapsMode => CAPS.some((item) => item === value);

const isTheme = (value: unknown): value is ThemeMode => THEMES.some((item) => item === value);

export const normalizeBaseFont = (value: unknown): string => {
  const font = typeof value === "string" ? value.trim() : "";
  return font && font !== FOLLOW_BASE && font !== FOLLOW_GROUP ? font : DEFAULT_BASE_FONT;
};

export const normalizeScale = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : scaleValue(number);
};

export const normalizeLeading = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : leadingValue(number);
};

export const normalizeTracking = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : trackingValue(number);
};

export const normalizeWeight = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return fallback;
  const number = numberOrNull(value);
  return number === null ? fallback : weightValue(number);
};

export const normalizeCaps = (value: unknown, fallback: CapsMode | null): CapsMode | null => {
  if (value === null) return fallback;
  return isCaps(value) ? value : fallback;
};

export const normalizeTheme = (value: unknown, fallback: ThemeMode): ThemeMode =>
  isTheme(value) ? value : fallback;

export const normalizeFlag = (value: unknown, fallback: boolean | null): boolean | null => {
  if (value === null) return fallback;
  return typeof value === "boolean" ? value : fallback;
};

export const normalizeBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const normalizeMeasure = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : measureValue(number);
};

export const normalizePortraitSize = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : portraitSizeValue(number);
};

export const normalizeReaderZoom = (value: unknown, fallback: number): number => {
  const number = numberOrNull(value);
  return number === null ? fallback : readerZoomValue(number);
};

const scale = v.pipe(v.number(), v.transform(scaleValue));
const leading = v.pipe(v.number(), v.transform(leadingValue));
const tracking = v.pipe(v.number(), v.transform(trackingValue));
const weight = v.pipe(v.number(), v.transform(weightValue));
const caps = v.picklist(CAPS);
const theme = v.picklist(THEMES);
const measure = v.pipe(v.number(), v.transform(measureValue));
const portraitSize = v.pipe(v.number(), v.transform(portraitSizeValue));
const readerZoom = v.pipe(v.number(), v.transform(readerZoomValue));

const entry = v.object({
  font: v.string(),
  scale,
  leading,
  tracking,
  weight: v.nullish(weight),
  italic: v.nullish(v.boolean()),
  caps: v.nullish(caps),
  numeric: v.nullish(v.boolean()),
});

const groupEntry = v.object({
  font: v.string(),
  scale,
  leading,
  tracking,
  weight: v.fallback(v.number(), 400),
  italic: v.fallback(v.boolean(), false),
  caps: v.fallback(caps, "none"),
  numeric: v.fallback(v.boolean(), false),
});

export const PrefsSchema = v.object({
  version: v.literal(PREFS_VERSION),
  theme,
  baseFont: v.fallback(v.string(), DEFAULT_BASE_FONT),
  groups: v.record(v.string(), groupEntry),
  slots: v.record(v.string(), entry),
  measure,
  showPortraits: v.fallback(v.boolean(), true),
  portraitSize,
  readerZoom: v.fallback(readerZoom, 0),
});

export type StoredPrefs = PrefState & { version: number };

const defaultGroupEntry = (): PrefEntry => ({
  font: FOLLOW_BASE,
  scale: 100,
  leading: 100,
  tracking: 0,
  weight: 400,
  italic: false,
  caps: "none",
  numeric: false,
});

const defaultSlotEntry = (slotId: string): PrefEntry => {
  const slot = TYPE_SLOTS.find((item) => item.id === slotId);
  return {
    font: slot?.font || FOLLOW_GROUP,
    scale: slot?.scale ?? 100,
    leading: slot?.leading ?? 100,
    tracking: slot?.tracking ?? 0,
    weight: slot?.weight ?? null,
    italic: slot?.italic ?? null,
    caps: slot?.caps ?? null,
    numeric: slot?.numeric ?? null,
  };
};

export const defaultPrefs = (): StoredPrefs => ({
  version: PREFS_VERSION,
  theme: "system",
  baseFont: DEFAULT_BASE_FONT,
  groups: Object.fromEntries(GROUPS.map((group) => [group.id, defaultGroupEntry()])),
  slots: Object.fromEntries(TYPE_SLOTS.map((slot) => [slot.id, defaultSlotEntry(slot.id)])),
  measure: MEASURE_DEFAULT,
  showPortraits: true,
  portraitSize: PORTRAIT_SIZE_DEFAULT,
  readerZoom: 0,
});

export const decodePrefs = (raw: unknown): StoredPrefs => {
  const parsed = v.safeParse(PrefsSchema, raw);
  if (!parsed.success) return defaultPrefs();
  const base = defaultPrefs();
  const source = parsed.output;
  const groups: Record<string, PrefEntry> = { ...base.groups };
  for (const [id, entry] of Object.entries(source.groups)) {
    groups[id] = {
      font: entry.font,
      scale: entry.scale,
      leading: entry.leading,
      tracking: entry.tracking,
      weight: entry.weight ?? 400,
      italic: entry.italic ?? false,
      caps: entry.caps ?? "none",
      numeric: entry.numeric ?? false,
    };
  }
  const slots: Record<string, PrefEntry> = { ...base.slots };
  for (const [id, entry] of Object.entries(source.slots)) {
    slots[id] = {
      font: entry.font,
      scale: entry.scale,
      leading: entry.leading,
      tracking: entry.tracking,
      weight: entry.weight ?? null,
      italic: entry.italic ?? null,
      caps: entry.caps ?? null,
      numeric: entry.numeric ?? null,
    };
  }
  return {
    version: PREFS_VERSION,
    theme: source.theme,
    baseFont: source.baseFont,
    groups,
    slots,
    measure: source.measure,
    showPortraits: source.showPortraits,
    portraitSize: source.portraitSize,
    readerZoom: source.readerZoom,
  };
};

export const PREFS_LIMITS = {
  measure: { min: MEASURE_MIN, max: MEASURE_MAX, fallback: MEASURE_DEFAULT },
  scale: { min: SCALE_MIN, max: SCALE_MAX, step: SCALE_STEP },
  leading: { min: LEADING_MIN, max: LEADING_MAX, step: 1 },
  tracking: { min: TRACKING_MIN, max: TRACKING_MAX, step: 0.01 },
  portraitSize: {
    min: PORTRAIT_SIZE_MIN,
    max: PORTRAIT_SIZE_MAX,
    step: PORTRAIT_SIZE_STEP,
    fallback: PORTRAIT_SIZE_DEFAULT,
  },
  zoom: { min: ZOOM_MIN, max: ZOOM_MAX, step: ZOOM_STEP },
};

export const PREFS_DEFAULTS = {
  baseFont: DEFAULT_BASE_FONT,
  followBase: FOLLOW_BASE,
  followGroup: FOLLOW_GROUP,
  weights: WEIGHTS,
  caps: CAPS,
  themes: THEMES,
};
