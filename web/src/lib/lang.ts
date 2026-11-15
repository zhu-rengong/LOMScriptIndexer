import { useNavigatorLanguage, usePreferredLanguages } from "@vueuse/core";
import { LANGS, messageOf } from "../i18n";
import { languageMeta } from "../i18n/meta";
import { keys, storedRef } from "./storage";

const DEFAULT = "zh-tw";

const has = (id: unknown): id is string => typeof id === "string" && LANGS.indexOf(id) >= 0;

const match = (raw: unknown): string => {
  const tag = String(raw ?? "").toLowerCase();
  if (!tag) return "";
  if (tag.indexOf("en") === 0) return "en";
  if (tag.indexOf("zh") !== 0) return "";
  return /hans|-cn|-sg|-my/.test(tag) ? "zh-cn" : "zh-tw";
};

const pinned = storedRef<string>(keys.lang, "", {
  decode: (raw, base) => (has(raw) ? raw : base),
  encode: (value) => value,
});

const preferredLanguages = usePreferredLanguages();
const { language } = useNavigatorLanguage();

const detect = (): string => {
  const tags = preferredLanguages.value.length ? preferredLanguages.value : [language.value || ""];
  for (const raw of tags) {
    const id = match(raw);
    if (has(id)) return id;
  }
  return has(DEFAULT) ? DEFAULT : LANGS[0] || DEFAULT;
};

const initial = (): string => (has(pinned.value) ? pinned.value : detect());

const pin = (id: string): boolean => {
  if (!has(id)) return false;
  pinned.value = id;
  return true;
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
