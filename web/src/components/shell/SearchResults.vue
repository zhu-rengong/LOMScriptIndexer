<script setup lang="ts">
import { chapterTitle, t } from "../../i18n";
import { nearBottom } from "../../lib/browser";
import { needleOf, type SearchHit } from "../../lib/search";

const SCROLL_THRESHOLD = 96;

const props = defineProps<{
  hits: SearchHit[];
  renderedCount: number;
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

const tooShort = computed(() => props.query.length < 2);

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
</script>

<template>
  <div
    id="searchResults"
    ref="panel"
    class="pop dropdown"
    role="listbox"
    :hidden="isHidden"
    @scroll="onScroll"
  >
    <template v-if="!tooShort">
      <div class="list-head">
        <span>{{ status.count }}</span>
        <span :hidden="!status.note">{{ status.note }}</span>
        <button v-if="hasFilter" class="btn-link" type="button" @click="emit('clear-filter')">
          {{ t("searchClearFilters") }}
        </button>
      </div>
      <div class="empty" :hidden="excludedCount <= 0">
        <button class="btn-link" type="button" @click="emit('clear-filter')">
          {{ status.excluded }}
        </button>
      </div>
      <div class="empty" :hidden="!status.message">{{ status.message }}</div>
      <div
        v-for="(hit, position) in visibleHits"
        :key="hit.id"
        class="row row-tall result"
        :class="{ 'is-active': position === 0 }"
        :data-id="hit.id"
        @click="emit('pick', hit)"
      >
        <span class="result-id">{{ hit.id }}</span>
        <span class="result-meta">{{ hit.chapter ? chapterTitle(hit.chapter) : "" }}</span>
        <span v-if="hit.snippet" class="result-text is-search">
          <template v-if="splitSnippet(hit)">
            {{ splitSnippet(hit)?.head }}<mark>{{ splitSnippet(hit)?.mark }}</mark
            >{{ splitSnippet(hit)?.tail }}
          </template>
          <template v-else>{{ hit.snippet }}</template>
        </span>
      </div>
    </template>
    <div v-else class="empty">{{ status.message }}</div>
  </div>
</template>
