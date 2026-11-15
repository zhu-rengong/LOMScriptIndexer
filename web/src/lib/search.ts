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

const BATCH = 12;

let lang = "";
let converted = false;
let engine = createSearchEngine();
let entries: IndexEntry[] = [];
let byId = new Map<string, IndexEntry>();
let pending: string[] = [];
let seen = new Set<string>();
let sorted = true;
let generation = 0;
let warming: Promise<void> | null = null;

const reset = (): void => {
  generation += 1;
  engine = createSearchEngine();
  entries = [];
  byId = new Map();
  pending = [];
  seen = new Set();
  sorted = true;
  warming = null;
};

export const needleOf = (input: unknown): string =>
  toNeedle(convert.text(script().textLang(), String(input ?? "")));

const syncIndex = (): void => {
  const current = script().lang;
  const ready = convert.hasConverter(script().textLang());
  if (current !== lang || ready !== converted) {
    lang = current;
    converted = ready;
    reset();
  }
  let added = false;
  for (const id of textStore.scriptIds()) {
    if (seen.has(id)) continue;
    seen.add(id);
    added = true;
    const nodeIndex = graph.indexById.get(id);
    const node = nodeIndex === undefined ? null : graph.nodes[nodeIndex];
    const entry: IndexEntry = {
      id,
      nodeIndex: nodeIndex === undefined ? -1 : nodeIndex,
      chapter: node ? graph.chapterOf(node) : null,
      text: "",
    };
    entries.push(entry);
    byId.set(id, entry);
    pending.push(id);
  }
  if (added) sorted = false;
  if (!sorted) {
    entries.sort((a, b) => a.nodeIndex - b.nodeIndex);
    sorted = true;
  }
};

const pause = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 200 });
      return;
    }
    setTimeout(resolve, 0);
  });

const drain = async (token: number): Promise<void> => {
  try {
    for (;;) {
      if (token !== generation || !pending.length) return;
      const batch = pending.splice(0, BATCH);
      const docs: SearchDoc[] = [];
      for (const id of batch) {
        if (token !== generation) return;
        const entry = byId.get(id);
        if (!entry) continue;
        const text = searchTextOfId(id);
        entry.text = text;
        docs.push({ key: id, text });
      }
      if (token !== generation) return;
      if (docs.length) engine.addAll(docs);
      await pause();
    }
  } catch (error) {
    if (token === generation) pending = [];
    console.error("[ScriptIndexer] search index build failed", error);
  }
};

export const warm = (): void => {
  syncIndex();
  if (warming || !pending.length) return;
  const token = generation;
  const task = drain(token);
  warming = task;
  void task.finally(() => {
    if (warming === task) warming = null;
  });
};

const ensureReady = async (): Promise<void> => {
  for (;;) {
    syncIndex();
    const token = generation;
    if (pending.length) warm();
    const task = warming;
    if (!task) return;
    await task;
    if (token === generation && !pending.length) return;
  }
};

const invalidate = (): void => {
  lang = "";
  converted = false;
  reset();
  resetSearchText();
};

const search = async (input: string): Promise<SearchResult> => {
  const result: SearchResult = { hits: [], total: 0, excludedByFilter: 0 };
  if (toNeedle(String(input ?? "")).length < 2) return result;
  await ensureReady();
  const needle = needleOf(input);
  if (needle.length < 2) return result;
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

export const searchIndex = { invalidate, search, warm };
