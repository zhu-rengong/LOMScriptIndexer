import { del, get, set } from "idb-keyval";
import type { AsPlainObject } from "minisearch";

const CACHE_KEY = "search-index";

export type SearchIndexCache = {
  key: string;
  ids: string[];
  saved: number;
  data: AsPlainObject;
};

export const readSearchIndex = async (key: string): Promise<SearchIndexCache | null> => {
  try {
    const cached = (await get(CACHE_KEY)) as SearchIndexCache | undefined;
    if (!cached || cached.key !== key) return null;
    if (!cached.data || !Array.isArray(cached.ids)) return null;
    if (typeof cached.saved !== "number") return null;
    return cached;
  } catch (error) {
    console.warn("[ScriptIndexer] search index cache read failed", error);
    return null;
  }
};

export const writeSearchIndex = async (cache: SearchIndexCache): Promise<boolean> => {
  try {
    await set(CACHE_KEY, cache);
    return true;
  } catch (error) {
    console.warn("[ScriptIndexer] search index cache write failed", error);
    return false;
  }
};

export const clearSearchIndex = async (): Promise<void> => {
  try {
    await del(CACHE_KEY);
  } catch (error) {
    console.warn("[ScriptIndexer] search index cache clear failed", error);
  }
};
