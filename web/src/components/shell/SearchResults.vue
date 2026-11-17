<script setup lang="ts">
import { chapterTitle, t } from "../../i18n";
import { nearBottom } from "../../lib/browser";
import { needleOf, type SearchHit } from "../../lib/search";

const SCROLL_THRESHOLD = 96;

const props = defineProps<{
  hits: SearchHit[];
  renderedCount: number;
  activeIndex: number;
  excludedCount: number;
  query: string;
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
  const needle = needleOf(props.query);
  const lower = hit.snippet.toLowerCase();
  const position = needle ? lower.indexOf(needle) : -1;
  if (position < 0 || !needle) return null;
  return {
    head: hit.snippet.slice(0, position),
    mark: hit.snippet.slice(position, position + needle.length),
    tail: hit.snippet.slice(position + needle.length),
  };
};

const onScroll = () => {
  const node = panel.value;
  if (!node || !nearBottom(node, SCROLL_THRESHOLD)) return;
  emit("more");
};

watch(
  () => props.activeIndex,
  async (index) => {
    await nextTick();
    const node = panel.value?.querySelectorAll<HTMLElement>(".drop-item")[index];
    node?.scrollIntoView({ block: "nearest" });
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
    @scroll="onScroll"
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
      v-for="(hit, position) in visibleHits"
      :key="hit.id"
      class="drop-item row row-tall"
      :class="{ 'is-active': position === activeIndex }"
      :data-id="hit.id"
      @click="emit('pick', hit)"
    >
      <span class="did">{{ hit.id }}</span>
      <span class="dmeta">{{ hit.chapter ? chapterTitle(hit.chapter) : "" }}</span>
      <span v-if="hit.snippet" class="dtext">
        <template v-if="splitSnippet(hit)">
          {{ splitSnippet(hit)?.head }}<mark>{{ splitSnippet(hit)?.mark }}</mark
          >{{ splitSnippet(hit)?.tail }}
        </template>
        <template v-else>{{ hit.snippet }}</template>
      </span>
    </div>
  </div>
</template>
