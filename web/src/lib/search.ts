import { convert } from "../data/convert";
import { graph } from "../data/graph";
import { dataset } from "../data/dataset";
import { textStore } from "../data/text";
import type { Chapter } from "../types/graph";
import * as beatRows from "./beatRows";
import { metaText } from "./conditions";
import { toNeedle } from "./browser";
import { scriptStore as script } from "./scriptStore";

export type SearchHit = {
  id: string;
  chapter: Chapter | null;
  snippet: string;
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
  excludedByFilter: number;
};

type IndexEntry = {
  id: string;
  nodeIndex: number;
  chapter: SearchHit["chapter"];
  text: string;
};

type SearchIndex = {
  lang: string;
  converted: boolean;
  seen: Set<string>;
  entries: IndexEntry[];
  sorted: boolean;
};

const emptyIndex = (): SearchIndex => ({
  lang: "",
  converted: false,
  seen: new Set(),
  entries: [],
  sorted: true,
});

export const needleOf = (input: unknown): string =>
  toNeedle(convert.text(script().textLang(), String(input ?? "")));

let cache: SearchIndex = emptyIndex();

const indexedMetaKinds = new Set([
  ...(dataset.vocab.itemKinds || []),
  "settitle",
  "mission",
  "missionTrigger",
]);

const indexedMetaText = (rows: unknown): string => {
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

const buildSearchIndex = (): SearchIndex => {
  const lang = script().textLang();
  const converted = convert.hasConverter(lang);
  if (cache.lang !== lang || cache.converted !== converted) cache = emptyIndex();
  cache.lang = lang;
  cache.converted = converted;
  const pack = textStore.pack(lang);
  const scripts = (pack && pack.scripts) || {};
  const ids = Object.keys(scripts);
  let added = false;
  for (const id of ids) {
    if (cache.seen.has(id)) continue;
    cache.seen.add(id);
    added = true;
    const nodeIndex = graph.indexById.get(id);
    const node = nodeIndex === undefined ? null : graph.nodes[nodeIndex];
    cache.entries.push({
      id,
      nodeIndex: nodeIndex === undefined ? -1 : nodeIndex,
      chapter: node ? graph.chapterOf(node) : null,
      text: `${beatRows.plainTextOf(scripts[id])}\n${indexedMetaText(scripts[id])}`.toLowerCase(),
    });
  }
  if (added) cache.sorted = false;
  if (!cache.sorted) {
    cache.entries.sort((a, b) => a.nodeIndex - b.nodeIndex);
    cache.sorted = true;
  }
  return cache;
};

const invalidate = (): void => {
  cache = emptyIndex();
};

const search = (input: string): SearchResult => {
  const needle = needleOf(input);
  const result: SearchResult = { hits: [], total: 0, excludedByFilter: 0 };
  if (needle.length < 2) return result;
  const current = buildSearchIndex();
  let excludedByFilter = 0;
  for (const entry of current.entries) {
    const position = entry.text.indexOf(needle);
    if (position < 0) continue;
    if (entry.nodeIndex < 0) continue;
    if (!graph.passesFilter(entry.nodeIndex, script().filterSet)) {
      excludedByFilter++;
      continue;
    }
    result.hits.push({
      id: entry.id,
      chapter: entry.chapter,
      snippet: entry.text.slice(Math.max(0, position - 16), position + 46),
    });
  }
  result.total = result.hits.length + excludedByFilter;
  result.excludedByFilter = excludedByFilter;
  return result;
};

export const searchIndex = { invalidate, search };
