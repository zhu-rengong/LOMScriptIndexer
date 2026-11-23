import { useNavigatorLanguage, usePreferredLanguages } from "@vueuse/core";
import { readDataset } from "../data/access";
import { graph } from "../data/graph";
import { lang as langState } from "../lib/lang";
import { popovers } from "../lib/popover";
import { keys, storedRef } from "../lib/storage";
import { router, scriptIdOf, showScript } from "../router";
import type { GraphNode } from "../types/graph";

export type ReadingAnchor = { path: number[]; offset: number };

const readBookmarks = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];

const bookmarksRef = () =>
  storedRef<string[]>(keys.bookmarks, [], { decode: (raw) => readBookmarks(raw) });

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

  const anchors = new Map<string, ReadingAnchor>();
  const lang = ref(initialLang());
  const selectedId = computed(() => {
    const id = scriptIdOf(router.currentRoute.value.params.id);
    return id && graph.nodeById.has(id) ? id : "";
  });

  const bookmarks = bookmarksRef();

  const selected = (): GraphNode | null =>
    selectedId.value ? graph.nodeById.get(selectedId.value) || null : null;

  const select = (id: string): boolean => {
    if (!graph.nodeById.has(id)) return false;
    if (selectedId.value === id) {
      popovers.closeTop(false);
      return true;
    }
    showScript(id);
    return true;
  };

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

  let restored = false;

  const restoreLang = (): void => {
    if (restored) return;
    restored = true;
    lang.value = initialLang();
    langState.applyDocument(lang.value);
  };

  const isBookmarked = (id: string): boolean => bookmarks.value.indexOf(id) >= 0;

  const bookmarkList = (): string[] => bookmarks.value.slice();

  const toggleBookmark = (id: string): boolean => {
    if (!id) return false;
    const index = bookmarks.value.indexOf(id);
    const next = bookmarks.value.slice();
    if (index >= 0) next.splice(index, 1);
    else next.push(id);
    bookmarks.value = next;
    return index < 0;
  };

  const clearBookmarks = (): void => {
    bookmarks.value = [];
  };

  const rememberAnchor = (id: string, anchor: ReadingAnchor): void => {
    if (!id) return;
    anchors.set(id, anchor);
  };

  const readingAnchor = (id: string): ReadingAnchor | null => anchors.get(id) ?? null;

  return {
    lang,
    selectedId,
    selected,
    select,
    restoreLang,
    textLang,
    setLang,
    isBookmarked,
    bookmarkList,
    toggleBookmark,
    clearBookmarks,
    rememberAnchor,
    readingAnchor,
  };
});
