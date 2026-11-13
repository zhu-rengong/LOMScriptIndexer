import { createI18n } from "vue-i18n";
import type { Composer } from "vue-i18n";
import en from "../locales/en.json";
import zhCn from "../locales/zh-cn.json";
import zhTw from "../locales/zh-tw.json";
import { dataset } from "../data/dataset";
import { slotById } from "../lib/fontTypes";
import { languageMeta } from "./meta";

export type TranslationKey = keyof typeof zhTw;

const FALLBACK = "zh-tw";

const messages = {
  "zh-tw": zhTw,
  "zh-cn": zhCn,
  en,
};

export const i18n = createI18n({
  legacy: false,
  locale: FALLBACK,
  fallbackLocale: FALLBACK,
  messages,
  flatJson: true,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
});

const composer = i18n.global as Composer;

export const LANGS = Object.keys(messages);

const ORDER: string[] = (() => {
  const out: string[] = [];
  for (const id of Object.keys(languageMeta)) if (LANGS.indexOf(id) >= 0) out.push(id);
  for (const id of LANGS) if (out.indexOf(id) < 0) out.push(id);
  return out;
})();

export const syncLocale = (lang: string): void => {
  if (LANGS.indexOf(lang) >= 0 && composer.locale.value !== lang) composer.locale.value = lang;
};

export const t = (
  key: TranslationKey | (string & Record<never, never>),
  vars?: Record<string, unknown>,
): string => {
  const text = String(composer.t(key, vars || {}));
  if (text !== key) return text;
  if (vars && vars.defaultValue !== undefined) return String(vars.defaultValue);
  return key;
};

export const tDynamic = (key: string, vars?: Record<string, unknown>): string =>
  t(key as TranslationKey, vars);

export const all = (key: TranslationKey | (string & Record<never, never>)): string[] => {
  const out: string[] = [];
  for (const id of LANGS) {
    const raw = (messages[id as keyof typeof messages] as Record<string, string>)[key];
    if (typeof raw !== "string") continue;
    for (const part of raw.split(",")) {
      const value = part.trim();
      if (value && out.indexOf(value) < 0) out.push(value);
    }
  }
  return out;
};

export const messageOf = (lang: string, key: TranslationKey): string => {
  const table = messages[lang as keyof typeof messages] as Record<string, string> | undefined;
  return table?.[key] ?? "";
};

export const languages = (): { id: string; native: string; label: string; html: string }[] =>
  ORDER.filter((id) => messages[id as keyof typeof messages]).map((id) => ({
    id,
    native: languageMeta[id]?.native || id,
    label: languageMeta[id]?.label || id,
    html: languageMeta[id]?.html || id,
  }));

export const langShort = (id: string): string =>
  languageMeta[id]?.short || languageMeta[id]?.native || String(id || "");

export const typeLabel = (slotId: string): string => {
  const slot = slotById(slotId);
  return slot ? t(slot.label) : String(slotId || "");
};

const CHAPTER_KEYS: Record<string, TranslationKey> = {
  prologue: "chPrologue",
  chapter: "chN",
  act: "actN",
  event: "eventN",
  scene: "chScene",
  work: "chWork",
  travel: "chTravel",
  free: "chFree",
  section: "chSection",
  misc: "chMisc",
  other: "chOther",
};

export const chapterTitle = (
  chapter: { kind?: string; number?: number | null } | null | undefined,
): string => {
  if (!chapter) return t("chOther");
  const key = CHAPTER_KEYS[chapter.kind || "other"] || "chOther";
  if (chapter.kind === "chapter" || chapter.kind === "act") {
    return t(key, { n: chapter.number });
  }
  if (chapter.kind === "event") {
    const number = chapter.number === null || chapter.number === undefined ? 0 : chapter.number;
    return t(key, { n: String(number).padStart(2, "0") });
  }
  return t(key);
};

const dateOf = (rounds: number): { year: number; month: number; period: number } => {
  const calendar = dataset.calendar || {};
  const perYear = calendar.roundsPerYear || 36;
  const perMonth = calendar.roundsPerMonth || 3;
  const index = Math.max(0, Math.floor(rounds) - 1);
  const year = Math.floor(index / perYear) + 1;
  const rest = index % perYear;
  return {
    year,
    month: Math.floor(rest / perMonth) + 1,
    period: (rest % perMonth) + 1,
  };
};

const stageNames = (): string[] => String(t("timeStages")).split(",");

export const timeDateText = (year: number, month: number, period: number): string =>
  t("timeFull", { y: year, m: month, s: stageNames()[period - 1] || "" });

export const timeText = (rounds: number): string => {
  const date = dateOf(rounds);
  return timeDateText(date.year, date.month, date.period);
};
