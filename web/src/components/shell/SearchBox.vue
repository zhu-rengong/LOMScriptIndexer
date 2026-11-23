<script setup lang="ts">
import { t } from "../../i18n";
import { useSearchPanel } from "../../composables/useSearchPanel";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
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
} = useSearchPanel();

const view = useViewStore();

const closeSearch = () => {
  view.collapseSearch();
  (byId(UI_IDS.search) as HTMLInputElement | null)?.blur();
};

onMounted(() => {
  popovers.register("search", {
    id: UI_IDS.searchWrap,
    triggerId: UI_IDS.searchToggle,
    group: "pop",
  });
});
</script>

<template>
  <div :id="UI_IDS.searchWrap" class="searchwrap">
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
