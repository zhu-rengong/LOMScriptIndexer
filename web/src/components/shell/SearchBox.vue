<script setup lang="ts">
import { textStore } from "../../data/text";
import { chapterTitle, t } from "../../i18n";
import { debounce, scheduleFrame } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { needleOf, searchIndex, type SearchHit } from "../../lib/search";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import PanelShell from "../ui/PanelShell.vue";
import FilterPopover from "./FilterPopover.vue";
import HitList, { type HitRow } from "./HitList.vue";
import { useScriptStore } from "../../stores/script";
import { usePanelsStore } from "../../stores/panels";
import { useUiStore } from "../../stores/ui";

const store = useScriptStore();
const panels = usePanelsStore();
const ui = useUiStore();

const PAGE = 50;
const KEY = "searchResults";

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

const open = computed(() => overlay.isOpen(KEY));

const hasActiveFilter = () => !!store.filterSet;

const show = () => {
  overlay.open(KEY, {
    trigger: input.value,
    placement: { align: "start", gap: 8, matchWidth: true, fit: true },
  });
};

const hide = () => {
  overlay.close(KEY);
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

const visibleRows = computed<HitRow[]>(() =>
  hits.value.slice(0, renderedCount.value).map((hit) => ({
    id: hit.id,
    chapter: hit.chapter ? chapterTitle(hit.chapter) : "",
    snippet: hit.snippet,
  })),
);

const activeHit = computed(() => hits.value[0]?.id || "");

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
  if (!open.value) {
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
      ui.setIoStatus("searchLoadingText", { loaded, total: totalShards });
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
  ui.setIoStatus("searchLoadingText", { loaded: state.loaded, total: state.total });
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

const pickById = (id: string) => {
  hide();
  panels.focusText(id, needleOf(lastQuery));
  store.select(id, { history: true });
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

const onScroll = (event: Event) => {
  const node = event.currentTarget as HTMLElement;
  if (node.scrollTop + node.clientHeight < node.scrollHeight - 96) return;
  appendMore();
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
</script>

<template>
  <div class="searchwrap">
    <div class="search-field field-wrap">
      <AppIcon name="search" class="field-icon" />
      <input
        id="search"
        v-model="query"
        class="field"
        type="search"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        :aria-expanded="open"
        aria-controls="searchResults"
        :placeholder="t('searchPlaceholder')"
        :title="t('searchTitle')"
        :aria-label="t('searchPlaceholder')"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
      />
      <kbd class="search-key" aria-hidden="true">/</kbd>
    </div>

    <FilterPopover />

    <PanelShell
      :id="KEY"
      :overlay-key="KEY"
      kind="menu"
      align="stretch"
      pad="none"
      :trigger-id="UI_IDS.search"
      :placement="{ align: 'start', gap: 8, matchWidth: true, fit: true }"
      :label="t('searchPlaceholder')"
      @scroll="onScroll"
    >
      <template v-if="query.trim().length >= 2">
        <div class="drop-scope">
          <span>{{ status.count }}</span>
          <button v-if="hasActiveFilter()" class="link" type="button" @click="clearFilter">
            {{ t("searchClearFilters") }}
          </button>
        </div>
        <p v-if="status.note" class="menu-note">{{ status.note }}</p>
        <p v-if="status.message" class="empty">{{ status.message }}</p>
        <button v-if="status.excluded" class="row drop-more" type="button" @click="clearFilter">
          {{ status.excluded }}
        </button>
        <HitList :rows="visibleRows" :query="lastQuery" :active-id="activeHit" @pick="pickById" />
      </template>
      <p v-else class="empty">{{ status.message || t("searchTooShort") }}</p>
    </PanelShell>
  </div>
</template>
