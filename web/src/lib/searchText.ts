import { convert } from "../data/convert";
import { dataset } from "../data/dataset";
import { textStore } from "../data/text";
import * as beatRows from "./beatRows";
import { metaText } from "./conditions";
import { scriptStore as script } from "./scriptStore";

const indexedMetaKinds = new Set([
  ...(dataset.vocab.itemKinds || []),
  "settitle",
  "mission",
  "missionTrigger",
]);

let lang = "";
let converted = false;

const plainTexts = new Map<string, string>();
const searchTexts = new Map<string, string>();

const sync = (): string => {
  const current = script().lang;
  const ready = convert.hasConverter(script().textLang());
  if (current !== lang || ready !== converted) {
    lang = current;
    converted = ready;
    plainTexts.clear();
    searchTexts.clear();
  }
  return script().textLang();
};

const rowsOf = (textLang: string, id: string): unknown => textStore.beatRows(textLang, id);

const metaOf = (rows: unknown): string => {
  const parts: string[] = [];
  beatRows.walkRows(rows, (row) => {
    if (!beatRows.isBeat(row, "meta")) return;
    const meta = beatRows.parseMeta(row);
    if (!indexedMetaKinds.has(meta.kind)) return;
    const label = metaText(meta.kind, meta.key, meta.value, meta.extra);
    if (label) parts.push(label);
  });
  return parts.join("\n");
};

const plainOf = (textLang: string, id: string): string => {
  const cached = plainTexts.get(id);
  if (cached !== undefined) return cached;
  const rows = rowsOf(textLang, id);
  if (!rows) return "";
  const text = beatRows.plainTextOf(rows).toLowerCase();
  plainTexts.set(id, text);
  return text;
};

export const plainTextOfId = (id: string): string => plainOf(sync(), id);

export const searchTextOfId = (id: string): string => {
  const textLang = sync();
  const cached = searchTexts.get(id);
  if (cached !== undefined) return cached;
  const rows = rowsOf(textLang, id);
  if (!rows) return "";
  const text = `${plainOf(textLang, id)}\n${metaOf(rows)}`.toLowerCase();
  searchTexts.set(id, text);
  return text;
};

export const resetSearchText = (): void => {
  lang = "";
  converted = false;
  plainTexts.clear();
  searchTexts.clear();
};
