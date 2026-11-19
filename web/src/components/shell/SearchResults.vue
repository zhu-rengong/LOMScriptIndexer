<script setup lang="ts">
import { chapterTitle, t } from "../../i18n";
import { nearBottom } from "../../lib/browser";
import { useSearchStore, type SearchHit } from "../../stores/search";

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

const search = useSearchStore();
const panel = ref<HTMLElement | null>(null);

const needle = computed(() => search.needle(props.query));

const visibleHits = computed(() => props.hits.slice(0, props.renderedCount));

const splitSnippet = (hit: SearchHit) => {
  const value = needle.value;
  const position = value ? hit.snippet.toLowerCase().indexOf(value) : -1;
  if (position < 0) return null;
  return {
    head: hit.snippet.slice(0, position),
    mark: hit.snippet.slice(position, position + value.length),
    tail: hit.snippet.slice(position + value.length),
  };
};

const rows = computed(() => visibleHits.value.map((hit) => ({ hit, parts: splitSnippet(hit) })));

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
      v-for="(row, position) in rows"
      :key="`${row.hit.id}:${position}`"
      class="drop-item row row-tall"
      :class="{ 'is-active': position === activeIndex }"
      :data-id="row.hit.id"
      @click="emit('pick', row.hit)"
    >
      <span class="did">{{ row.hit.id }}</span>
      <span class="dmeta">{{ row.hit.chapter ? chapterTitle(row.hit.chapter) : "" }}</span>
      <span v-if="row.hit.snippet" class="dtext">
        <template v-if="row.parts">
          {{ row.parts.head }}<mark>{{ row.parts.mark }}</mark>{{ row.parts.tail }}
        </template>
        <template v-else>{{ row.hit.snippet }}</template>
      </span>
    </div>
  </div>
</template>
