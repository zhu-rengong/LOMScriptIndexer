<script setup lang="ts">
import { textStore } from "../../data/text";
import { t } from "../../i18n";
import { debounce, scheduleFrame } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { needleOf, searchIndex, type SearchHit } from "../../lib/search";
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

let lastQuery = "";
let renderedQuery = "";
let renderedFilterSet: Set<number> | null = null;
let isStale = true;
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

const messageText = (value: string) => {
  if (value.length < 2) return t("searchTooShort");
  if (hits.value.length) return "";
  if (!textStore.progress().done) return "";
  return t(hasActiveFilter() ? "searchNoHit" : "searchEmpty");
};

const status = ref({ count: "", note: "", excluded: "", message: "" });

const updateStatus = (value: string) => {
  status.value = {
    count: t("searchCount", { n: hits.value.length }),
    note: noteText(),
    excluded: excludedCount.value > 0 ? t("searchOutside", { n: excludedCount.value }) : "",
    message: messageText(value),
  };
};

const syncHits = (value: string, keepScroll = false) => {
  const result = searchIndex.search(value);
  hits.value = result.hits;
  total.value = result.total;
  excludedCount.value = result.excludedByFilter;
  const limit = keepScroll ? Math.max(renderedCount.value, PAGE) : PAGE;
  renderedCount.value = Math.min(hits.value.length, limit);
  updateStatus(value);
  renderedQuery = value;
  renderedFilterSet = store.filterSet;
  isStale = false;
};

const appendMore = () => {
  if (renderedCount.value >= hits.value.length) return;
  renderedCount.value = Math.min(hits.value.length, renderedCount.value + PAGE);
};

const clearFilter = () => {
  store.setFilterState({ source: "", set: null, error: "", loading: false });
  searchNow();
};

const searchNow = (): number => {
  const value = query.value.trim();
  lastQuery = value;
  if (!value) {
    hide();
    return 0;
  }
  const filterSet = store.filterSet;
  if (!isStale && value === renderedQuery && filterSet === renderedFilterSet && hits.value.length) {
    updateStatus(value);
    show();
    return hits.value.length;
  }
  syncHits(value);
  show();
  return hits.value.length;
};

const refresh = scheduleFrame(() => {
  const value = query.value.trim();
  if (value.length < 2) return;
  lastQuery = value;
  if (!openState.value) {
    isStale = true;
    return;
  }
  const result = searchIndex.search(value);
  if (result.total !== total.value || !hits.value.length) {
    syncHits(value, true);
    return;
  }
  updateStatus(value);
});

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
      if (query.value.trim()) searchNow();
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
  searchNow();
  const value = query.value.trim();
  const state = textStore.progress();
  if (value.length < 2 || state.done) return;
  ui.setIoStatus(t("searchLoadingText", { loaded: state.loaded, total: state.total }));
  warmFullText(store.textLang());
};

const onInput = debounce(submit, 160);

const pickFirst = (): boolean => {
  const hit = hits.value[0];
  if (!hit) return false;
  hide();
  panels.focusText(hit.id, needleOf(lastQuery));
  store.select(hit.id, { history: true });
  return true;
};

const pick = (hit: SearchHit) => {
  hide();
  panels.focusText(hit.id, needleOf(lastQuery));
  store.select(hit.id, { history: true });
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    hide();
    input.value?.blur();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    pickFirst();
  }
};

const onFocus = () => {
  if (query.value.trim()) submit();
};

const reset = () => {
  hits.value = [];
  total.value = 0;
  excludedCount.value = 0;
  renderedCount.value = 0;
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
