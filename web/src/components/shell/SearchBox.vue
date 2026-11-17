<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { textStore } from "../../data/text";
import { t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import { needleOf, searchIndex, type SearchHit, type SearchResult } from "../../lib/search";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import FilterPopover from "./FilterPopover.vue";
import SearchResults from "./SearchResults.vue";
import { useScriptStore } from "../../stores/script";
import { usePanelsStore } from "../../stores/panels";
import { useUiStore } from "../../stores/ui";

const store = useScriptStore();
const panels = usePanelsStore();
const ui = useUiStore();

const PAGE = 50;

const input = ref<HTMLInputElement | null>(null);
const query = ref("");
const hits = ref<SearchHit[]>([]);
const total = ref(0);
const excludedCount = ref(0);
const renderedCount = ref(0);
const activeIndex = ref(0);
const building = ref(false);
const buildProgress = ref({ done: 0, total: 0 });

let lastQuery = "";
let renderedQuery = "";
let renderedFilterSet: Set<number> | null = null;
let isStale = true;
let requestSeq = 0;
let warmPromise: Promise<unknown> | null = null;
let warmLang = "";

const openState = ref(false);

const hasActiveFilter = () => !!store.filterSet;

const show = () => {
  overlay.open("searchResults", {
    trigger: input.value,
    placement: { align: "start", gap: 8, matchWidth: true, fit: true },
  });
  openState.value = true;
};

const hide = () => {
  overlay.close("searchResults");
  openState.value = false;
};

const loadingText = () => {
  const state = textStore.progress();
  if (state.done) return "";
  return t("searchLoadingText", { loaded: state.loaded, total: state.total });
};

const noteText = () => {
  const loading = loadingText();
  if (loading) return loading;
  return hasActiveFilter() ? t("searchScoped") : "";
};

const messageText = () => {
  const progress = buildProgress.value;
  const loading = !textStore.progress().done;
  if (progress.total > 0 && (progress.done < progress.total || loading)) {
    return t("searchIndexingText", progress);
  }
  if (building.value) return "";
  if (hits.value.length) return "";
  if (loading) return "";
  return t(hasActiveFilter() ? "searchNoHit" : "searchEmpty");
};

const status = ref({ count: "", note: "", excluded: "", message: "" });

const updateStatus = () => {
  status.value = {
    count: t("searchCount", { n: hits.value.length }),
    note: noteText(),
    excluded: excludedCount.value > 0 ? t("searchOutside", { n: excludedCount.value }) : "",
    message: messageText(),
  };
};

const applyResult = (value: string, result: SearchResult, keepScroll: boolean) => {
  hits.value = result.hits;
  total.value = result.total;
  excludedCount.value = result.excludedByFilter;
  const limit = keepScroll ? Math.max(renderedCount.value, PAGE) : PAGE;
  renderedCount.value = Math.min(hits.value.length, limit);
  activeIndex.value = 0;
  updateStatus();
  renderedQuery = value;
  renderedFilterSet = store.filterSet;
  isStale = false;
};

const syncHits = async (value: string, keepScroll = false): Promise<number> => {
  const seq = ++requestSeq;
  building.value = true;
  updateStatus();
  const result = await searchIndex.search(value, (done, count) => {
    if (seq !== requestSeq) return;
    buildProgress.value = { done, total: count };
    updateStatus();
  });
  if (seq !== requestSeq) return 0;
  building.value = false;
  applyResult(value, result, keepScroll);
  return result.hits.length;
};

const appendMore = () => {
  if (renderedCount.value >= hits.value.length) return;
  renderedCount.value = Math.min(hits.value.length, renderedCount.value + PAGE);
};

const clearFilter = () => {
  store.setFilterState({ source: "", set: null, error: "", loading: false });
  void searchNow();
};

const searchNow = async (): Promise<number> => {
  const value = query.value.trim();
  lastQuery = value;
  if (!value) {
    hide();
    return 0;
  }
  const filterSet = store.filterSet;
  if (!isStale && value === renderedQuery && filterSet === renderedFilterSet && hits.value.length) {
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
  lastQuery = value;
  if (!openState.value) {
    isStale = true;
    return;
  }
  const seq = ++requestSeq;
  const result = await searchIndex.search(value, (done, count) => {
    if (seq !== requestSeq) return;
    buildProgress.value = { done, total: count };
    updateStatus();
  });
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

const warmFullText = (lang: string) => {
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

const submit = () => {
  void searchNow();
  const value = query.value.trim();
  const state = textStore.progress();
  if (!value || state.done) return;
  ui.setIoStatus(t("searchLoadingText", { loaded: state.loaded, total: state.total }));
  warmFullText(store.textLang());
};

const onInput = useDebounceFn(submit, 160);

const pickAt = (index: number): boolean => {
  const hit = hits.value[Math.min(index, hits.value.length - 1)] ?? hits.value[0];
  if (!hit) return false;
  hide();
  panels.focusText(hit.id, hit.anchor || needleOf(lastQuery));
  store.select(hit.id, { history: true });
  return true;
};

const pick = (hit: SearchHit) => {
  hide();
  panels.focusText(hit.id, hit.anchor || needleOf(lastQuery));
  store.select(hit.id, { history: true });
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    hide();
    input.value?.blur();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const count = Math.min(renderedCount.value, hits.value.length);
    if (!count) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    activeIndex.value = (activeIndex.value + step + count) % count;
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    void searchNow().then(() => pickAt(activeIndex.value));
  }
};

const onFocus = () => {
  if (query.value.trim()) submit();
};

const reset = () => {
  requestSeq++;
  building.value = false;
  buildProgress.value = { done: 0, total: 0 };
  hits.value = [];
  total.value = 0;
  excludedCount.value = 0;
  renderedCount.value = 0;
  activeIndex.value = 0;
  renderedQuery = "";
  renderedFilterSet = null;
  isStale = true;
  ui.setIoStatus("");
  hide();
};

watch(
  () => store.lang,
  () => {
    reset();
  },
);

onMounted(() => {
  overlay.register("searchResults", {
    id: "searchResults",
    triggerId: UI_IDS.search,
    group: "menu",
    placement: { align: "start", gap: 8, matchWidth: true, fit: true },
    onHide: () => {
      openState.value = false;
    },
  });
});
</script>

<template>
  <div class="searchwrap">
    <div class="search-field">
      <AppIcon name="search" class="search-icon" />
      <input
        id="search"
        v-model="query"
        class="search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        :aria-expanded="openState"
        aria-controls="searchResults"
        :placeholder="t('searchPlaceholder')"
        :title="t('searchTitle')"
        :aria-label="t('searchPlaceholder')"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <kbd class="search-key" aria-hidden="true">/</kbd>
      <SearchResults
        :hits="hits"
        :rendered-count="renderedCount"
        :active-index="activeIndex"
        :excluded-count="excludedCount"
        :query="lastQuery"
        :status="status"
        :is-hidden="!openState"
        :has-filter="hasActiveFilter()"
        @pick="pick"
        @more="appendMore"
        @clear-filter="clearFilter"
      />
    </div>

    <FilterPopover />
  </div>
</template>
