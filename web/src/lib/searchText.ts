import { convert } from "../data/convert";
import { dataset } from "../data/dataset";
import { textStore } from "../data/text";
import { normalizeSearchText } from "./browser";
import * as beatRows from "./beatRows";
import { metaText } from "./conditions";
import { pinia } from "../stores";
import { useScriptStore } from "../stores/script";

const script = () => useScriptStore(pinia);

const indexedMetaKinds = new Set([
  ...(dataset.vocab.itemKinds || []),
  "settitle",
  "mission",
  "missionTrigger",
]);

let lang = "";
let converted = false;

const plainParts = new Map<string, string[]>();
const searchLines = new Map<string, string[]>();

const sync = (): string => {
  const current = script().lang;
  const ready = convert.hasConverter(script().textLang());
  if (current !== lang || ready !== converted) {
    lang = current;
    converted = ready;
    plainParts.clear();
    searchLines.clear();
  }
  return script().textLang();
};

const rowsOf = (textLang: string, id: string): unknown => textStore.beatRows(textLang, id);

const metaPartsOf = (rows: unknown): string[] => {
  const parts: string[] = [];
  beatRows.walkRows(rows, (row) => {
    if (!beatRows.isBeat(row, "meta")) return;
    const meta = beatRows.parseMeta(row);
    if (!indexedMetaKinds.has(meta.kind)) return;
    const label = metaText(meta.kind, meta.key, meta.value, meta.extra);
    if (label) parts.push(label);
  });
  return parts;
};

const partsOf = (textLang: string, id: string): string[] => {
  const cached = plainParts.get(id);
  if (cached !== undefined) return cached;
  const rows = rowsOf(textLang, id);
  if (!rows) return [];
  const parts = beatRows.searchPartsOf(rows);
  plainParts.set(id, parts);
  return parts;
};

export const searchLinesOfId = (id: string): string[] => {
  const textLang = sync();
  const cached = searchLines.get(id);
  if (cached !== undefined) return cached;
  const rows = rowsOf(textLang, id);
  if (!rows) return [];
  const lines: string[] = [];
  for (const part of partsOf(textLang, id)) {
    const text = normalizeSearchText(part);
    if (text) lines.push(text);
  }
  for (const part of metaPartsOf(rows)) {
    const text = normalizeSearchText(part);
    if (text) lines.push(text);
  }
  searchLines.set(id, lines);
  return lines;
};

export const resetSearchText = (): void => {
  lang = "";
  converted = false;
  plainParts.clear();
  searchLines.clear();
};
