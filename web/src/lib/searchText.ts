import { convert } from "../data/convert";
import { readDataset } from "../data/access";
import { textStore } from "../data/text";
import { normalizeSearchText } from "./browser";
import * as beatRows from "./beatRows";
import { metaText, missionEventTarget, missionEventView } from "./conditions";

const script = () => useScriptStore(pinia);

export type SearchLine = { text: string; target: FocusTarget | null };

const EXTRA_META_KINDS = ["settitle", "mission", "missionTrigger"];

let indexedKinds: Set<string> | null = null;

const metaKinds = (): Set<string> =>
  (indexedKinds ??= new Set([...(readDataset().vocab.itemKinds || []), ...EXTRA_META_KINDS]));

let lang = "";
let converted = false;

const plainParts = new Map<string, string[]>();
const searchLines = new Map<string, SearchLine[]>();

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

const metaLinesOf = (rows: unknown): SearchLine[] => {
  const lines: SearchLine[] = [];
  beatRows.walkRows(rows, (row) => {
    if (!beatRows.isBeat(row, "meta")) return;
    const meta = beatRows.parseMeta(row);
    if (!metaKinds().has(meta.kind)) return;
    const mission = meta.kind === "mission" || meta.kind === "missionTrigger";
    const event = mission ? missionEventView(meta.kind, meta.key, meta.value, meta.extra) : null;
    if (mission && !event) return;
    const label = metaText(meta.kind, meta.key, meta.value, meta.extra);
    if (!label) return;
    lines.push({ text: label, target: event ? missionEventTarget(event) : null });
  });
  return lines;
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

export const searchLinesOfId = (id: string): SearchLine[] => {
  const textLang = sync();
  const cached = searchLines.get(id);
  if (cached !== undefined) return cached;
  const rows = rowsOf(textLang, id);
  if (!rows) return [];
  const lines: SearchLine[] = [];
  for (const part of partsOf(textLang, id)) {
    const text = normalizeSearchText(part);
    if (text) lines.push({ text, target: null });
  }
  for (const line of metaLinesOf(rows)) {
    const text = normalizeSearchText(line.text);
    if (text) lines.push({ text, target: line.target });
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
