import { useDebounceFn } from "@vueuse/core";
import { textStore } from "../data/text";
import { t } from "../i18n";
import { byId } from "../lib/dom";
import { clampIndex, stepIndex } from "../lib/listNav";
import { popovers } from "../lib/popover";
import { searchIndex } from "../lib/searchIndex";
import type { SearchHit, SearchResult } from "../lib/searchIndex";
import { UI_IDS } from "../ui/ids";

const PAGE = 50;

export const useSearchPanel = () => {
  const store = useScriptStore();
  const filter = useFilterStore();
  const panels = usePanelsStore();
  const ui = useUiStore();

  const query = ref("");
  const hits = ref<SearchHit[]>([]);
  const total = ref(0);
  const excludedCount = ref(0);
  const renderedCount = ref(0);
  const activeIndex = ref(0);
  const building = ref(false);
  const buildProgress = ref({ done: 0, total: 0 });
  const openState = computed(() => popovers.isOpen("searchResults"));
  const status = ref({ count: "", note: "", excluded: "", message: "" });

  let renderedQuery = "";
  let renderedMatches: Set<number> | null = null;
  let isStale = true;
  let requestSeq = 0;
  let warmPromise: Promise<unknown> | null = null;
  let warmLang = "";

  const hasActiveFilter = (): boolean => !!filter.matches;

  const loadingText = (): string => {
    const state = textStore.progress();
    return state.done ? "" : t("searchLoadingText", { loaded: state.loaded, total: state.total });
  };

  const messageText = (): string => {
    const progress = buildProgress.value;
    const loading = !textStore.progress().done;
    if (progress.total > 0 && (progress.done < progress.total || loading)) {
      return t("searchIndexingText", progress);
    }
    if (building.value || hits.value.length || loading) return "";
    return t(hasActiveFilter() ? "searchNoHit" : "searchEmpty");
  };

  const updateStatus = (): void => {
    const loading = loadingText();
    status.value = {
      count: t("searchCount", { n: hits.value.length }),
      note: loading || (hasActiveFilter() ? t("searchScoped") : ""),
      excluded: excludedCount.value > 0 ? t("searchOutside", { n: excludedCount.value }) : "",
      message: messageText(),
    };
  };

  const show = (): void => {
    popovers.open("searchResults", { trigger: byId(UI_IDS.search) });
  };

  const hide = (): void => {
    popovers.close("searchResults");
  };

  const applyResult = (value: string, result: SearchResult, keepScroll: boolean): void => {
    hits.value = result.hits;
    total.value = result.total;
    excludedCount.value = result.excludedByFilter;
    const limit = keepScroll ? Math.max(renderedCount.value, PAGE) : PAGE;
    renderedCount.value = Math.min(hits.value.length, limit);
    activeIndex.value = 0;
    updateStatus();
    renderedQuery = value;
    renderedMatches = filter.matches;
    isStale = false;
  };

  const trackProgress = (seq: number) => (done: number, count: number) => {
    if (seq !== requestSeq) return;
    buildProgress.value = { done, total: count };
    updateStatus();
  };

  const syncHits = async (value: string, keepScroll = false): Promise<number> => {
    const seq = ++requestSeq;
    building.value = true;
    updateStatus();
    const result = await searchIndex.search(value, filter.matches, trackProgress(seq));
    if (seq !== requestSeq) return 0;
    building.value = false;
    applyResult(value, result, keepScroll);
    return result.hits.length;
  };

  const appendMore = (): void => {
    if (renderedCount.value >= hits.value.length) return;
    renderedCount.value = Math.min(hits.value.length, renderedCount.value + PAGE);
  };

  const clearFilter = (): void => {
    filter.reset();
    void searchNow();
  };

  const searchNow = async (): Promise<number> => {
    const value = query.value.trim();
    if (!value) {
      hide();
      return 0;
    }
    const matches = filter.matches;
    if (!isStale && value === renderedQuery && matches === renderedMatches && hits.value.length) {
      updateStatus();
      show();
      return hits.value.length;
    }
    show();
    return syncHits(value);
  };

  const runRefresh = async (): Promise<void> => {
    const value = query.value.trim();
    if (!value) return;
    if (!openState.value) {
      isStale = true;
      return;
    }
    const seq = ++requestSeq;
    const result = await searchIndex.search(value, filter.matches, trackProgress(seq));
    if (seq !== requestSeq) return;
    building.value = false;
    if (result.total !== total.value || !hits.value.length) {
      applyResult(value, result, true);
      return;
    }
    updateStatus();
  };

  const refresh = useDebounceFn(() => {
    void runRefresh();
  }, 16);

  const warmFullText = (lang: string): Promise<unknown> => {
    if (warmPromise && warmLang === lang) return warmPromise;
    warmLang = lang;
    const chain = textStore
      .ensureAll(lang, (loaded, totalShards) => {
        ui.setIoStatus(t("searchLoadingText", { loaded, total: totalShards }));
        refresh();
      })
      .then(() => {
        if (warmPromise === chain) {
          warmPromise = null;
          warmLang = "";
        }
        ui.setIoStatus("");
        searchIndex.warm();
        if (query.value.trim()) void searchNow();
      })
      .catch(() => {
        if (warmPromise === chain) {
          warmPromise = null;
          warmLang = "";
        }
        ui.setIoStatus("");
      });
    warmPromise = chain;
    return chain;
  };

  const submit = (): void => {
    void searchNow();
    const value = query.value.trim();
    const state = textStore.progress();
    if (!value || state.done) return;
    ui.setIoStatus(t("searchLoadingText", { loaded: state.loaded, total: state.total }));
    void warmFullText(store.textLang());
  };

  const onInput = useDebounceFn(submit, 160);

  const pickAt = (index: number): boolean => {
    const hit = hits.value[clampIndex(index, hits.value.length)];
    if (!hit) return false;
    panels.focusText(hit.id, hit.anchor, hit.target);
    store.select(hit.id);
    return true;
  };

  const pick = (hit: SearchHit): void => {
    panels.focusText(hit.id, hit.anchor, hit.target);
    store.select(hit.id);
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const count = Math.min(renderedCount.value, hits.value.length);
      if (!count) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      activeIndex.value = stepIndex(activeIndex.value, step, count, true);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void searchNow().then(() => pickAt(activeIndex.value));
    }
  };

  const onFocus = (): void => {
    if (query.value.trim()) submit();
  };

  const reset = (): void => {
    requestSeq++;
    building.value = false;
    buildProgress.value = { done: 0, total: 0 };
    hits.value = [];
    total.value = 0;
    excludedCount.value = 0;
    renderedCount.value = 0;
    activeIndex.value = 0;
    renderedQuery = "";
    renderedMatches = null;
    isStale = true;
    ui.setIoStatus("");
    hide();
  };

  watch(
    () => store.lang,
    () => reset(),
  );

  onMounted(() => {
    popovers.register("searchResults", {
      id: UI_IDS.searchResults,
      triggerId: UI_IDS.search,
      group: "menu",
      keep: ["search"],
    });
  });

  return {
    query,
    hits,
    renderedCount,
    activeIndex,
    excludedCount,
    status,
    openState,
    hasActiveFilter,
    onInput,
    onFocus,
    onKeydown,
    pick,
    appendMore,
    clearFilter,
    hide,
  };
};
