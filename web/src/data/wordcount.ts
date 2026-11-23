import type { WordCountPayload } from "../types/generated";
import type { WordCount, WordCountPack, WordPack, WordRow } from "../types/text";
import { EN_INDEX, ZH_INDEX } from "../types/text";
import { readDataset } from "./access";
import { fetchJson } from "./load";

const FALLBACK_KINDS = ["dialog", "narration", "think", "option", "lore"];

const script = () => useScriptStore(pinia);

let cache: WordCountPack | null = null;
let pending: Promise<WordCountPack | null> | null = null;

const kinds = (): string[] => (cache?.kinds && cache.kinds.length ? cache.kinds : FALLBACK_KINDS);

const toRow = (row: number[][]): WordRow =>
  row.map((count) => {
    const values = Array.isArray(count) ? count : [];
    return [Number(values[ZH_INDEX]) || 0, Number(values[EN_INDEX]) || 0];
  });

const mapRows = (rows: Record<string, number[][]> | undefined): Record<string, WordRow> => {
  const out: Record<string, WordRow> = {};
  for (const [id, row] of Object.entries(rows ?? {})) out[id] = toRow(row);
  return out;
};

const normalize = (payload: WordCountPayload): WordCountPack => {
  const langs: Record<string, WordPack> = {};
  for (const [id, pack] of Object.entries(payload.langs ?? {})) {
    langs[id] = { scripts: mapRows(pack.scripts), chapters: mapRows(pack.chapters) };
  }
  return { kinds: payload.kinds ?? [], langs };
};

const loadWordCount = (): Promise<WordCountPack | null> => {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  pending = fetchJson<WordCountPayload>(readDataset().assetUrl("wordcount"))
    .then((payload) => {
      cache = normalize(payload);
      return cache;
    })
    .catch(() => null);
  return pending;
};

const wordPack = (): WordPack | null => {
  if (!cache || !cache.langs) return null;
  return cache.langs[script().textLang()] || cache.langs[Object.keys(cache.langs)[0]] || null;
};

const countsOf = (row: WordRow | undefined, kind: string): WordCount => {
  const total: WordCount = [0, 0];
  if (!row) return total;
  const labels = kinds();
  for (let index = 0; index < labels.length; index++) {
    if (kind !== "all" && labels[index] !== kind) continue;
    const counts = row[index];
    if (!counts) continue;
    total[ZH_INDEX] += counts[ZH_INDEX] || 0;
    total[EN_INDEX] += counts[EN_INDEX] || 0;
  }
  return total;
};

export const wordCount = {
  countsOf,
  kinds,
  load: loadWordCount,
  pack: wordPack,
};
