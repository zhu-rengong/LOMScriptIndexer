import { get, set } from "idb-keyval";
import type { AsPlainObject } from "minisearch";

const CACHE_KEY = "search-index";

export type SearchIndexCache = {
  key: string;
  ids: string[];
  data: AsPlainObject;
};

export const readSearchIndex = async (key: string): Promise<SearchIndexCache | null> => {
  try {
    const cached = (await get(CACHE_KEY)) as SearchIndexCache | undefined;
    if (!cached || cached.key !== key) return null;
    if (!cached.data || !Array.isArray(cached.ids)) return null;
    return cached;
  } catch (error) {
    console.warn("[ScriptIndexer] search index cache read failed", error);
    return null;
  }
};

export const writeSearchIndex = async (cache: SearchIndexCache): Promise<void> => {
  try {
    await set(CACHE_KEY, cache);
  } catch (error) {
    console.warn("[ScriptIndexer] search index cache write failed", error);
  }
};
