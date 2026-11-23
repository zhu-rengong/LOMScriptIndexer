import { useNavigatorLanguage, usePreferredLanguages } from "@vueuse/core";
import { readDataset } from "../data/access";
import { graph } from "../data/graph";
import { lang as langState } from "../lib/lang";
import { keys, storedRef } from "../lib/storage";
import type { GraphNode } from "../types/graph";

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
  const preferredLanguages = usePreferredLanguages();
  const navigatorLanguage = useNavigatorLanguage();
  const pinnedLang = storedRef<string>(keys.lang, "", {
    decode: (raw, base) => (langState.has(raw) ? raw : base),
    encode: (value) => value,
  });

  const detectedLang = (): string => {
    const tags = preferredLanguages.value.length
      ? preferredLanguages.value
      : [navigatorLanguage.language.value || ""];
    return langState.detect(tags);
  };

  const initialLang = (): string =>
    langState.has(pinnedLang.value) ? pinnedLang.value : detectedLang();

  const positions = new Map<string, number>();
  const lang = ref(initialLang());
  const selectedId = ref("");
  const filterSource = ref("");
  const filterSet = shallowRef<Set<number> | null>(null);
  const filterError = ref("");
  const filterLoading = ref(false);
  const filterRevision = ref(0);

  const bookmarks = bookmarksRef();
  const bookmarkVersion = ref(0);

  const selected = (): GraphNode | null =>
    selectedId.value ? graph.nodeById.get(selectedId.value) || null : null;

  const select = (id: string): boolean => {
    const node = graph.nodeById.get(id);
    if (!node) return false;
    selectedId.value = id;
    return true;
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
    const meta = readDataset().meta;
    if (meta.langs.indexOf(lang.value) >= 0) return lang.value;
    if (meta.langs.indexOf(meta.defaultLang) >= 0) return meta.defaultLang;
    return meta.langs[0] || meta.defaultLang || "";
  };

  const setLang = (id: string): boolean => {
    if (!langState.has(id)) return false;
    const changed = id !== lang.value;
    pinnedLang.value = id;
    lang.value = id;
    return changed;
  };

  const restoreLang = (): void => {
    if (restored) return;
    restored = true;
    lang.value = initialLang();
    langState.applyDocument(lang.value);
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
    filterSource,
    filterSet,
    filterError,
    filterLoading,
    filterRevision,
    bookmarkVersion,
    selected,
    select,
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
