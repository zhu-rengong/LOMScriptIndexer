<script setup lang="ts">
import { useInfiniteScroll } from "@vueuse/core";
import { chapterTitle, t } from "../../i18n";
import { scrollAt } from "../../lib/listNav";
import type { SearchHit } from "../../lib/searchIndex";

const SCROLL_THRESHOLD = 96;

const props = defineProps<{
  hits: SearchHit[];
  renderedCount: number;
  activeIndex: number;
  excludedCount: number;
  status: { count: string; note: string; excluded: string; message: string };
  isHidden: boolean;
  hasFilter: boolean;
}>();

const emit = defineEmits<{
  (event: "pick", hit: SearchHit): void;
  (event: "more"): void;
  (event: "clear-filter"): void;
}>();

const panel = ref<HTMLElement | null>(null);

const visibleHits = computed(() => props.hits.slice(0, props.renderedCount));

const splitSnippet = (hit: SearchHit) => {
  const start = hit.matchStart;
  const end = start + hit.matchLength;
  return {
    head: hit.snippet.slice(0, start),
    mark: hit.snippet.slice(start, end),
    tail: hit.snippet.slice(end),
  };
};

const rows = computed(() => visibleHits.value.map((hit) => ({ hit, parts: splitSnippet(hit) })));

useInfiniteScroll(panel, () => emit("more"), {
  distance: SCROLL_THRESHOLD,
  canLoadMore: () => props.renderedCount < props.hits.length,
});

watch(
  () => props.activeIndex,
  async (index) => {
    await nextTick();
    scrollAt(panel.value, ".drop-item", index);
  },
);
</script>

<template>
  <div
    id="searchResults"
    ref="panel"
    class="dropdown surface popover"
    role="listbox"
    :hidden="isHidden"
  >
    <div class="drop-scope">
      <span class="drop-scope-text">
        <span>{{ status.count }}</span>
        <span :hidden="!status.note">{{ status.note }}</span>
        <span :hidden="excludedCount <= 0">{{ status.excluded }}</span>
      </span>
      <button v-if="hasFilter" class="btn-link" type="button" @click="emit('clear-filter')">
        {{ t("searchClearFilters") }}
      </button>
    </div>
    <div class="drop-empty popover-empty" :hidden="!status.message">{{ status.message }}</div>
    <div
      v-for="(row, position) in rows"
      :key="`${row.hit.id}:${row.hit.lineIndex}:${row.hit.matchStart}`"
      class="drop-item row row-tall"
      :class="{ 'is-active': position === activeIndex }"
      :data-id="row.hit.id"
      @click="emit('pick', row.hit)"
    >
      <span class="did">{{ row.hit.id }}</span>
      <span class="dmeta">{{ row.hit.chapter ? chapterTitle(row.hit.chapter) : "" }}</span>
      <span v-if="row.hit.snippet" class="dtext">
        {{ row.parts.head }}<mark>{{ row.parts.mark }}</mark
        >{{ row.parts.tail }}
      </span>
    </div>
  </div>
</template>
