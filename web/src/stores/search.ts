import { convert } from "../data/convert";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import type { Chapter } from "../types/graph";
import { normalizeSearchText } from "../lib/browser";
import { measure } from "../lib/perf";
import { createSearchEngine, searchCandidates, type SearchDoc } from "../lib/searchEngine";
import { resetSearchText, searchLinesOfId, type SearchLine } from "../lib/searchText";
import type { FocusTarget } from "./panels";
import { useScriptStore } from "./script";

export type SearchHit = {
  id: string;
  chapter: Chapter | null;
  snippet: string;
  anchor: string;
  target: FocusTarget | null;
  matchStart: number;
  matchLength: number;
};

export type SearchResult = {
  hits: SearchHit[];
  total: number;
  excludedByFilter: number;
};

export type SearchProgress = (done: number, total: number) => void;

type IndexEntry = {
  id: string;
  nodeIndex: number;
  chapter: SearchHit["chapter"];
  lines: SearchLine[];
};

const SLICE = 48;

const hitsOf = (entry: IndexEntry, needle: string): SearchHit[] => {
  const hits: SearchHit[] = [];
  for (const line of entry.lines) {
    const position = line.text.indexOf(needle);
    if (position < 0) continue;
    const start = Math.max(0, position - 16);
    hits.push({
      id: entry.id,
      chapter: entry.chapter,
      snippet: line.text.slice(start, position + 46),
      anchor: line.text,
      target: line.target,
      matchStart: position - start,
      matchLength: needle.length,
    });
  }
  return hits;
};

class SearchIndex {
  private engine = createSearchEngine();
  private entries: IndexEntry[] = [];
  private byId = new Map<string, IndexEntry>();
  private pending: string[] = [];
  private seen = new Set<string>();
  private prepared = 0;
  private sorted = true;
  private generation = 0;
  private warming: Promise<void> | null = null;
  private lang = "";
  private converted = false;
  private readonly listeners = new Set<SearchProgress>();

  private script() {
    return useScriptStore();
  }

  private needleOf(input: string): string {
    return normalizeSearchText(convert.text(this.script().textLang(), input));
  }

  invalidate(): void {
    this.lang = "";
    this.converted = false;
    this.reset();
    resetSearchText();
  }

  warm(): void {
    this.syncIndex();
    if (this.warming || !this.pending.length) return;
    const token = this.generation;
    const task = this.drain(token);
    this.warming = task;
    void task.finally(() => {
      if (this.warming === task) this.warming = null;
    });
  }

  async search(input: string, onProgress?: SearchProgress): Promise<SearchResult> {
    const result: SearchResult = { hits: [], total: 0, excludedByFilter: 0 };
    const needle = this.needleOf(input);
    if (!needle) return result;
    if (onProgress) {
      this.listeners.add(onProgress);
      this.notify();
    }
    try {
      await this.ensureReady();
    } finally {
      if (onProgress) this.listeners.delete(onProgress);
    }
    const candidates = searchCandidates(this.engine, needle);
    const allowed = candidates === null ? null : new Set(candidates);
    let excludedByFilter = 0;
    for (const entry of this.entries) {
      if (allowed && !allowed.has(entry.id)) continue;
      if (entry.nodeIndex < 0) continue;
      const hits = hitsOf(entry, needle);
      if (!hits.length) continue;
      if (!graph.passesFilter(entry.nodeIndex, this.script().filterSet)) {
        excludedByFilter++;
        continue;
      }
      result.hits.push(...hits);
    }
    result.total = result.hits.length + excludedByFilter;
    result.excludedByFilter = excludedByFilter;
    return result;
  }

  private reset(): void {
    this.generation += 1;
    this.engine = createSearchEngine();
    this.entries = [];
    this.byId = new Map();
    this.pending = [];
    this.seen = new Set();
    this.prepared = 0;
    this.sorted = true;
    this.warming = null;
  }

  private notify(): void {
    const total = this.entries.length;
    for (const listener of this.listeners) listener(this.prepared, total);
  }

  private syncIndex(): void {
    const script = this.script();
    const current = script.lang;
    const ready = convert.hasConverter(script.textLang());
    if (current !== this.lang || ready !== this.converted) {
      this.lang = current;
      this.converted = ready;
      this.reset();
    }
    let added = false;
    for (const id of textStore.scriptIds()) {
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      added = true;
      const nodeIndex = graph.indexById.get(id);
      const node = nodeIndex === undefined ? null : graph.nodes[nodeIndex];
      const entry: IndexEntry = {
        id,
        nodeIndex: nodeIndex === undefined ? -1 : nodeIndex,
        chapter: node ? graph.chapterOf(node) : null,
        lines: [],
      };
      this.entries.push(entry);
      this.byId.set(id, entry);
      this.pending.push(id);
    }
    if (added) this.sorted = false;
    if (!this.sorted) {
      this.entries.sort((left, right) => left.nodeIndex - right.nodeIndex);
      this.sorted = true;
    }
    if (added) this.notify();
  }

  private async drain(token: number): Promise<void> {
    try {
      while (this.pending.length) {
        if (token !== this.generation) return;
        const batch = this.pending.splice(0, SLICE);
        const docs: SearchDoc[] = [];
        for (const id of batch) {
          const entry = this.byId.get(id);
          if (!entry) continue;
          const lines = searchLinesOfId(id);
          entry.lines = lines;
          this.prepared += 1;
          docs.push({ key: id, text: lines.map((line) => line.text).join("\n") });
        }
        if (docs.length) {
          await this.engine.addAllAsync(docs, { chunkSize: SLICE });
          if (token !== this.generation) return;
        }
        this.notify();
      }
    } catch (error) {
      if (token === this.generation) this.pending = [];
      console.error("[ScriptIndexer] search index build failed", error);
    }
  }

  private async ensureReady(): Promise<void> {
    for (;;) {
      this.syncIndex();
      const token = this.generation;
      if (this.pending.length) this.warm();
      const task = this.warming;
      if (!task) return;
      await task;
      if (token === this.generation && !this.pending.length) return;
    }
  }
}

export const useSearchStore = defineStore("search", () => {
  const index = new SearchIndex();
  return {
    invalidate: () => index.invalidate(),
    warm: () => index.warm(),
    search: (input: string, onProgress?: SearchProgress) =>
      measure("search", () => index.search(input, onProgress)),
  };
});
