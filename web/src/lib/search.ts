import { convert } from "../data/convert";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import type { Chapter } from "../types/graph";
import { toNeedle } from "./browser";
import { createSearchEngine, searchCandidates, type SearchDoc } from "./searchEngine";
import { resetSearchText, searchTextOfId } from "./searchText";
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

let lang = "";
let converted = false;
let engine = createSearchEngine();
let entries: IndexEntry[] = [];
let seen = new Set<string>();
let sorted = true;

const reset = (): void => {
  engine = createSearchEngine();
  entries = [];
  seen = new Set();
  sorted = true;
};

export const needleOf = (input: unknown): string =>
  toNeedle(convert.text(script().textLang(), String(input ?? "")));

const buildSearchIndex = (): void => {
  const current = script().lang;
  const ready = convert.hasConverter(script().textLang());
  if (current !== lang || ready !== converted) {
    lang = current;
    converted = ready;
    reset();
  }
  const pack = textStore.pack(script().textLang());
  const scripts = (pack && pack.scripts) || {};
  const fresh: SearchDoc[] = [];
  for (const id of Object.keys(scripts)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const nodeIndex = graph.indexById.get(id);
    const node = nodeIndex === undefined ? null : graph.nodes[nodeIndex];
    const text = searchTextOfId(id);
    entries.push({
      id,
      nodeIndex: nodeIndex === undefined ? -1 : nodeIndex,
      chapter: node ? graph.chapterOf(node) : null,
      text,
    });
    fresh.push({ key: id, text });
  }
  if (fresh.length) {
    engine.addAll(fresh);
    sorted = false;
  }
  if (!sorted) {
    entries.sort((a, b) => a.nodeIndex - b.nodeIndex);
    sorted = true;
  }
};

const invalidate = (): void => {
  lang = "";
  reset();
  resetSearchText();
};

const search = (input: string): SearchResult => {
  const needle = needleOf(input);
  const result: SearchResult = { hits: [], total: 0, excludedByFilter: 0 };
  if (needle.length < 2) return result;
  buildSearchIndex();
  const candidates = searchCandidates(engine, needle);
  const allowed = candidates === null ? null : new Set(candidates);
  let excludedByFilter = 0;
  for (const entry of entries) {
    if (allowed && !allowed.has(entry.id)) continue;
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
