import { LANGS, messageOf } from "../i18n";
import { languageMeta } from "../i18n/meta";
import { keys, readRaw, writeRaw } from "./storage";

const KEY = keys.lang;
const DEFAULT = "zh-tw";

const has = (id: unknown): id is string => typeof id === "string" && LANGS.indexOf(id) >= 0;

const match = (raw: unknown): string => {
  const tag = String(raw ?? "").toLowerCase();
  if (!tag) return "";
  if (tag.indexOf("en") === 0) return "en";
  if (tag.indexOf("zh") !== 0) return "";
  return /hans|-cn|-sg|-my/.test(tag) ? "zh-cn" : "zh-tw";
};

const read = (): string => readRaw(KEY) || "";

const pinnedLang = (): string => {
  const id = read();
  return has(id) ? id : "";
};

const detect = (): string => {
  const tags =
    navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ""];
  for (const raw of tags) {
    const id = match(raw);
    if (has(id)) return id;
  }
  return has(DEFAULT) ? DEFAULT : LANGS[0] || DEFAULT;
};

const initial = (): string => pinnedLang() || detect();

const pin = (id: string): boolean => {
  if (!has(id)) return false;
  return writeRaw(KEY, id);
};

const htmlOf = (id: string): string => languageMeta[id]?.html || String(id || DEFAULT);

const titleOf = (id: string): string => messageOf(id, "appTitle");

const applyDocument = (id?: string): string => {
  const value = id && has(id) ? id : initial();
  document.documentElement.lang = htmlOf(value);
  const title = titleOf(value);
  if (title) document.title = title;
  return value;
};

export const lang = {
  has,
  htmlOf,
  initial,
  pin,
  applyDocument,
};
