<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { t } from "../../i18n";
import { useSearchPanel } from "../../composables/useSearchPanel";
import { byId } from "../../lib/browser";
import { UI_IDS } from "../../ui/ids";

const {
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
} = useSearchPanel();

const view = useViewStore();

const wrap = ref<HTMLElement | null>(null);

const closeSearch = () => {
  hide();
  view.collapseSearch();
  (byId(UI_IDS.search) as HTMLInputElement | null)?.blur();
};

onClickOutside(wrap, (event) => {
  if (!view.searchOpen) return;
  const target = event.target as Node | null;
  if (target && byId(UI_IDS.searchToggle)?.contains(target)) return;
  closeSearch();
});
</script>

<template>
  <div ref="wrap" class="searchwrap">
    <div class="search-field">
      <AppIcon name="search" class="search-icon" />
      <input
        :id="UI_IDS.search"
        v-model="query"
        class="search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        role="combobox"
        :aria-expanded="openState"
        :aria-controls="UI_IDS.searchResults"
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
        :status="status"
        :is-hidden="!openState"
        :has-filter="hasActiveFilter()"
        @pick="pick"
        @more="appendMore"
        @clear-filter="clearFilter"
      />
    </div>

    <FilterPopover />

    <button
      :id="UI_IDS.searchClose"
      class="btn btn-icon search-close"
      type="button"
      :title="t('closeTitle')"
      :aria-label="t('closeTitle')"
      @click="closeSearch"
    >
      <AppIcon name="close" />
    </button>
  </div>
</template>
