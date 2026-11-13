<script setup lang="ts">
import { graph } from "../../data/graph";
import { chapterTitle, t } from "../../i18n";
import { byId, debounce, nearBottom } from "../../lib/browser";
import { applyFilter, EXAMPLES, FIELD_LABEL_KEYS, RESULT_LIMIT } from "../../lib/filter";
import { overlay } from "../../lib/overlay";
import { query } from "../../lib/query";
import type { QuerySuggestion } from "../../types/query";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useExprAutocomplete } from "../../composables/useExprAutocomplete";
import { useScriptStore } from "../../stores/script";

const store = useScriptStore();

const OPS = ["AND", "OR", "NOT", "(", ")"];
const SUGGEST_LIMIT = 100;

const POPOVER_KEY = UI_IDS.filterPopover;
const SUGGEST_KEY = UI_IDS.filterSuggestions;

const exprInput = ref<HTMLInputElement | null>(null);
const resultsPanel = ref<HTMLElement | null>(null);
const suggestPanel = ref<HTMLElement | null>(null);
const exprValue = ref(store.filterSource);
const visibleLimit = ref(RESULT_LIMIT);
const suggestLimit = ref(SUGGEST_LIMIT);

const applyDebounced = debounce(() => {
  applyFilter(exprValue.value);
}, 250);

const {
  state: suggestState,
  isOpen: isSuggestOpen,
  update: updateSuggestions,
  insert: insertAtCursor,
  accept: acceptSuggestion,
  hide: hideSuggestions,
  onInput: onExpressionInput,
  onKeydown,
  onKeyup,
  onBlur,
} = useExprAutocomplete(exprInput, exprValue, {
  domId: SUGGEST_KEY,
  suggestKey: SUGGEST_KEY,
  popoverKey: POPOVER_KEY,
  onChange: () => applyDebounced(),
  onSubmit: () => {
    applyDebounced.cancel();
    hideSuggestions();
    applyFilter(exprValue.value);
  },
});

const fields = computed(() => query.fields());

const hasAppliedFilter = computed(() => !!store.filterSet);

const badgeCount = computed(() => {
  const set = store.filterSet;
  if (!set) return "";
  return set.size > 99 ? "99+" : String(set.size);
});

const status = computed(() => {
  const { filterError, filterSource, filterSet, filterLoading } = store;
  if (filterError) return { text: filterError, className: "filter-status is-error" };
  if (!filterSource.trim()) return { text: t("filterIdle"), className: "filter-status" };
  if (filterSet && filterSet.size === 0) {
    return {
      text: filterLoading ? t("filterLoadingText") : t("filterNoMatch"),
      className: filterLoading ? "filter-status" : "filter-status is-error",
    };
  }
  return {
    text: filterLoading ? t("filterLoadingText") : "",
    className: "filter-status is-ok",
  };
});

const hitNodeIndexes = computed(() => {
  void store.filterRevision;
  const set = store.filterSet;
  return set ? Array.from(set) : [];
});

const resultRows = computed(() =>
  hitNodeIndexes.value.slice(0, visibleLimit.value).map((index) => {
    const node = graph.nodes[index];
    return { id: node.id, chapter: chapterTitle(graph.chapterOf(node)) };
  }),
);

const suggestLabel = (item: QuerySuggestion) => {
  if (item.kind === "field") {
    return t(FIELD_LABEL_KEYS[String(item.value)] || String(item.value));
  }
  if (item.kind === "logic") return "";
  return item.label || "";
};

const suggestShown = (item: QuerySuggestion) =>
  item.kind === "logic" ? item.value : `${item.value}${item.kind === "field" ? ":" : ""}`;

const suggestRows = computed(() => suggestState.value.items.slice(0, suggestLimit.value));

watch(suggestState, () => {
  suggestLimit.value = SUGGEST_LIMIT;
  void nextTick(() => {
    if (suggestPanel.value) suggestPanel.value.scrollTop = 0;
  });
});

const onSuggestScroll = (event: Event) => {
  const node = event.currentTarget as HTMLElement;
  if (!nearBottom(node, 40)) return;
  const total = suggestState.value.items.length;
  suggestLimit.value = Math.min(total, suggestLimit.value + SUGGEST_LIMIT);
};

const openPopover = () => {
  exprValue.value = store.filterSource;
  overlay.open(POPOVER_KEY, { trigger: byId(UI_IDS.filterBtn) });
  void nextTick(() => {
    const node = exprInput.value;
    if (!node) return;
    node.focus();
    node.select();
  });
};

const toggle = () => {
  if (overlay.isOpen(POPOVER_KEY)) overlay.close(POPOVER_KEY);
  else openPopover();
};

const closePanel = () => overlay.close(POPOVER_KEY);

const applyExample = (expr: string) => {
  exprValue.value = expr;
  applyFilter(expr);
};

const onChipInsert = (value: string) => {
  insertAtCursor(value);
  applyDebounced();
};

const onResultsScroll = () => {
  const node = resultsPanel.value;
  if (!node || !nearBottom(node, 40)) return;
  visibleLimit.value = Math.min(hitNodeIndexes.value.length, visibleLimit.value + RESULT_LIMIT);
};

const pickNode = (id: string) => {
  overlay.close(POPOVER_KEY);
  store.select(id, { history: true });
};

watch(
  () => store.filterSource,
  (value) => {
    const node = exprInput.value;
    if (node && document.activeElement === node) return;
    if (exprValue.value !== value) exprValue.value = value;
  },
);

onMounted(() => {
  overlay.register(POPOVER_KEY, {
    id: POPOVER_KEY,
    triggerId: UI_IDS.filterBtn,
    group: "pop",
    onHide: () => {
      hideSuggestions();
    },
  });
});

const isPopoverOpen = computed(() => overlay.isOpen(POPOVER_KEY));
</script>

<template>
  <div class="menu-wrap">
    <button
      id="filterBtn"
      class="btn filter-btn"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="isPopoverOpen"
      :aria-controls="POPOVER_KEY"
      :title="t('filterBtnTitle')"
      :class="{ 'is-on': hasAppliedFilter }"
      @click.stop="toggle"
    >
      <AppIcon name="filter" class="ico" />
      <span class="btn-label">{{ t("filterBtn") }}</span>
      <span id="filterBadge" class="badge badge-solid badge-num" :hidden="!hasAppliedFilter">{{
        badgeCount
      }}</span>
    </button>

    <div
      :id="POPOVER_KEY"
      class="filter-panel surface popover"
      role="dialog"
      aria-labelledby="filterHeading"
      :hidden="!isPopoverOpen"
    >
      <header class="filter-head">
        <div class="filter-head-text">
          <h2 id="filterHeading" class="filter-title">{{ t("filterBtn") }}</h2>
          <p class="filter-summary">{{ t("filterBtnTitle") }}</p>
        </div>
        <button
          class="btn btn-icon filter-close"
          type="button"
          :title="t('closeTitle')"
          :aria-label="t('closeTitle')"
          @click="closePanel"
        >
          <AppIcon name="close" />
        </button>
      </header>

      <div class="filter-row">
        <div class="filter-input-wrap" :class="{ 'is-error': !!store.filterError }">
          <input
            id="filterExpr"
            ref="exprInput"
            v-model="exprValue"
            class="input input-mono filter-expr"
            type="text"
            spellcheck="false"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="isSuggestOpen"
            :aria-controls="SUGGEST_KEY"
            :placeholder="t('filterPlaceholder')"
            :aria-label="t('filterPlaceholder')"
            @input="onExpressionInput"
            @click="updateSuggestions"
            @keyup="onKeyup"
            @keydown="onKeydown"
            @blur="onBlur"
          />
          <div
            :id="SUGGEST_KEY"
            ref="suggestPanel"
            class="filter-suggest surface popover"
            role="listbox"
            :hidden="!isSuggestOpen"
            @scroll.passive="onSuggestScroll"
          >
            <template v-if="suggestRows.length">
              <button
                v-for="(item, index) in suggestRows"
                :key="`${item.value}-${index}`"
                class="suggest-item row row-sm"
                :class="{ 'is-active': index === suggestState.activeIndex }"
                type="button"
                role="option"
                @mousedown.prevent="acceptSuggestion(index)"
              >
                <span class="sg-value">{{ suggestShown(item) }}</span>
                <span v-if="suggestLabel(item)" class="sg-label">{{ suggestLabel(item) }}</span>
                <span v-if="item.count" class="sg-count">
                  {{ t("suggestCount", { n: item.count }) }}
                </span>
              </button>
            </template>
            <div v-else class="suggest-empty popover-empty">{{ t("suggestEmpty") }}</div>
          </div>
        </div>
      </div>
      <div id="filterStatus" :class="status.className">{{ status.text }}</div>

      <div class="filter-section">
        <p class="filter-label">{{ t("filterFields") }}</p>
        <div id="filterFieldChips" class="filter-chips">
          <button
            v-for="field in fields"
            :key="field.id"
            class="filter-chip btn btn-sm btn-mono"
            type="button"
            :data-insert="`${field.id}:`"
            @click="onChipInsert(`${field.id}:`)"
          >
            {{ t(FIELD_LABEL_KEYS[field.id] || field.id) }}
          </button>
        </div>
      </div>
      <div class="filter-section">
        <p class="filter-label">{{ t("filterOperators") }}</p>
        <div id="filterOpChips" class="filter-chips">
          <button
            v-for="op in OPS"
            :key="op"
            class="filter-chip btn btn-sm btn-mono"
            type="button"
            :data-insert="op === '(' || op === ')' ? op : ` ${op} `"
            @click="onChipInsert(op === '(' || op === ')' ? op : ` ${op} `)"
          >
            {{ op }}
          </button>
        </div>
      </div>
      <div class="filter-section">
        <p class="filter-label">{{ t("filterExamples") }}</p>
        <div id="filterExampleChips" class="filter-chips">
          <button
            v-for="example in EXAMPLES"
            :key="example.key"
            class="filter-chip btn btn-sm btn-mono"
            type="button"
            :data-expr="example.expr"
            @click="applyExample(example.expr)"
          >
            {{ t(example.key) }}
          </button>
        </div>
      </div>

      <div
        id="filterResults"
        class="filter-results"
        :hidden="!hasAppliedFilter || !store.filterSource.trim()"
      >
        <div class="filter-results-title">
          {{ t("filterResults", { n: hitNodeIndexes.length }) }}
          <span class="filter-count">
            {{ t("filterCount", { n: hitNodeIndexes.length, total: graph.nodes.length }) }}
          </span>
        </div>
        <div v-if="!hitNodeIndexes.length" class="filter-results-empty">
          {{ t("filterResultsEmpty") }}
        </div>
        <div
          v-else
          ref="resultsPanel"
          class="filter-results-list"
          @scroll.passive="onResultsScroll"
        >
          <button
            v-for="row in resultRows"
            :key="row.id"
            class="result-item row row-sm"
            :class="{ 'is-active': store.selectedId === row.id }"
            type="button"
            :data-id="row.id"
            @click="pickNode(row.id)"
          >
            <span class="ri-id">{{ row.id }}</span>
            <span class="ri-ch">{{ row.chapter }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
