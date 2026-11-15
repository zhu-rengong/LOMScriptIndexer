<script setup lang="ts">
import { needleOf } from "../../lib/search";

export type HitRow = { id: string; chapter: string; snippet?: string };

const props = withDefaults(
  defineProps<{
    rows: HitRow[];
    query?: string;
    activeId?: string;
  }>(),
  { query: "", activeId: "" },
);

const emit = defineEmits<{ pick: [id: string] }>();

const parts = (snippet: string) => {
  const needle = needleOf(props.query);
  if (!needle) return null;
  const position = snippet.toLowerCase().indexOf(needle);
  if (position < 0) return null;
  return {
    head: snippet.slice(0, position),
    mark: snippet.slice(position, position + needle.length),
    tail: snippet.slice(position + needle.length),
  };
};
</script>

<template>
  <button
    v-for="row in rows"
    :key="row.id"
    class="row drop-item"
    :class="{ 'is-active': row.id === activeId }"
    type="button"
    :data-id="row.id"
    @click="emit('pick', row.id)"
  >
    <span class="did">{{ row.id }}</span>
    <span class="dmeta">{{ row.chapter }}</span>
    <span v-if="row.snippet" class="dtext">
      <template v-if="parts(row.snippet)">
        {{ parts(row.snippet)?.head }}<mark>{{ parts(row.snippet)?.mark }}</mark
        >{{ parts(row.snippet)?.tail }}
      </template>
      <template v-else>{{ row.snippet }}</template>
    </span>
  </button>
</template>
