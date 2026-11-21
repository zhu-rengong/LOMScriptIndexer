import { LANGS, messageOf } from "../i18n";
import { languageMeta } from "../i18n/meta";

const DEFAULT = "zh-tw";

const has = (id: unknown): id is string => typeof id === "string" && LANGS.indexOf(id) >= 0;

const match = (raw: unknown): string => {
  const tag = String(raw ?? "").toLowerCase();
  if (!tag) return "";
  if (tag.indexOf("en") === 0) return "en";
  if (tag.indexOf("zh") !== 0) return "";
  return /hans|-cn|-sg|-my/.test(tag) ? "zh-cn" : "zh-tw";
};

const detect = (tags: readonly string[]): string => {
  for (const raw of tags) {
    const id = match(raw);
    if (has(id)) return id;
  }
  return has(DEFAULT) ? DEFAULT : LANGS[0] || DEFAULT;
};

const htmlOf = (id: string): string => languageMeta[id]?.html || String(id || DEFAULT);

const titleOf = (id: string): string => messageOf(id, "appTitle");

const applyDocument = (id: string): string => {
  const value = has(id) ? id : DEFAULT;
  document.documentElement.lang = htmlOf(value);
  const title = titleOf(value);
  if (title) document.title = title;
  return value;
};

export const lang = { has, htmlOf, applyDocument, detect };
