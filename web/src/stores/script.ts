import { defineStore } from "pinia";
import { dataset } from "../data/dataset";
import { graph } from "../data/graph";
import { lang as langState } from "../lib/lang";
import { keys, storedRef } from "../lib/storage";
import type { GraphNode } from "../types/graph";

const graphMeta = dataset.meta;
const initialLang = langState.initial;
const hasLang = langState.has;
const pinLang = langState.pin;
const applyDocumentLang = langState.applyDocument;

export type FilterState = {
  source: string;
  set: Set<number> | null;
  error: string;
  loading: boolean;
};

const readBookmarks = (raw: unknown): Set<string> => {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const id of raw) if (typeof id === "string") out.add(id);
  return out;
};

const bookmarksRef = () =>
  storedRef<Set<string>>(keys.bookmarks, new Set<string>(), {
    decode: (raw) => readBookmarks(raw),
    encode: (value) => JSON.stringify(Array.from(value)),
  });

export const useScriptStore = defineStore("script", () => {
  const positions = new Map<string, number>();
  const lang = ref(initialLang());
  const selectedId = ref("");
  const history = ref<string[]>([]);
  const historyIndex = ref(-1);
  const filterSource = ref("");
  const filterSet = shallowRef<Set<number> | null>(null);
  const filterError = ref("");
  const filterLoading = ref(false);
  const filterRevision = ref(0);

  const bookmarks = bookmarksRef();
  const bookmarkVersion = ref(0);

  const selected = (): GraphNode | null =>
    selectedId.value ? graph.nodeById.get(selectedId.value) || null : null;

  const select = (id: string, options?: { history?: boolean }): boolean => {
    const node = graph.nodeById.get(id);
    if (!node) return false;
    const opts = options || {};
    selectedId.value = id;
    if (opts.history !== false) {
      const next = history.value.slice(0, historyIndex.value + 1);
      if (next[next.length - 1] !== id) next.push(id);
      history.value = next;
      historyIndex.value = next.length - 1;
    }
    return true;
  };

  const back = (): GraphNode | null => {
    if (historyIndex.value <= 0) return null;
    const id = history.value[historyIndex.value - 1];
    if (!graph.nodeById.has(id)) return null;
    historyIndex.value -= 1;
    selectedId.value = id;
    return graph.nodeById.get(id) || null;
  };

  const forward = (): GraphNode | null => {
    if (historyIndex.value >= history.value.length - 1) return null;
    const id = history.value[historyIndex.value + 1];
    if (!graph.nodeById.has(id)) return null;
    historyIndex.value += 1;
    selectedId.value = id;
    return graph.nodeById.get(id) || null;
  };

  const setFilterState = (state: FilterState): void => {
    filterSource.value = state.source;
    filterSet.value = state.set === null ? null : markRaw(state.set);
    filterError.value = state.error;
    filterLoading.value = state.loading;
    filterRevision.value++;
  };

  let restored = false;

  const textLang = (): string => {
    if (graphMeta.langs.indexOf(lang.value) >= 0) return lang.value;
    if (graphMeta.langs.indexOf(graphMeta.defaultLang) >= 0) return graphMeta.defaultLang;
    return graphMeta.langs[0] || graphMeta.defaultLang || "";
  };

  const setLang = (id: string): boolean => {
    if (!hasLang(id)) return false;
    const changed = id !== lang.value;
    pinLang(id);
    lang.value = id;
    return changed;
  };

  const restoreLang = (): void => {
    if (restored) return;
    restored = true;
    lang.value = initialLang();
    applyDocumentLang(lang.value);
    filterRevision.value++;
  };

  const isBookmarked = (id: string): boolean => bookmarks.value.has(id);

  const bookmarkList = (): string[] => Array.from(bookmarks.value);

  const toggleBookmark = (id: string): boolean => {
    if (!id) return false;
    if (bookmarks.value.has(id)) bookmarks.value.delete(id);
    else bookmarks.value.add(id);
    bookmarkVersion.value++;
    return bookmarks.value.has(id);
  };

  const clearBookmarks = (): void => {
    bookmarks.value.clear();
    bookmarkVersion.value++;
  };

  const rememberPosition = (id: string, fraction: number): void => {
    if (!id || typeof fraction !== "number" || !Number.isFinite(fraction)) return;
    positions.set(id, Math.max(0, Math.min(1, fraction)));
  };

  const positionOf = (id: string): number => positions.get(id) ?? 0;

  return {
    lang,
    selectedId,
    history,
    historyIndex,
    filterSource,
    filterSet,
    filterError,
    filterLoading,
    filterRevision,
    bookmarkVersion,
    selected,
    select,
    back,
    forward,
    setFilterState,
    restoreLang,
    textLang,
    setLang,
    isBookmarked,
    bookmarkList,
    toggleBookmark,
    clearBookmarks,
    rememberPosition,
    positionOf,
  };
});
