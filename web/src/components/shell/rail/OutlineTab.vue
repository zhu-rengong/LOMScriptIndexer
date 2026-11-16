<script setup lang="ts">
import type { RailRow } from "../../../lib/rail";
import { t } from "../../../i18n";
import AppIcon from "../../ui/AppIcon.vue";

const props = defineProps<{
  items: { row: RailRow; top: number }[];
  height: number;
  selectedId: string;
  searching: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle", index: number): void;
  (event: "pick", id: string): void;
}>();
</script>

<template>
  <div v-if="props.items.length" class="rail-vlist" :style="{ height: `${props.height}px` }">
    <template v-for="{ row, top } in props.items" :key="row.key">
      <button
        v-if="row.kind === 'chapter'"
        class="cat-chap rail-vpos"
        :class="{ 'is-open': row.open }"
        :style="{ top: `${top}px` }"
        type="button"
        :disabled="props.searching"
        :aria-expanded="row.open"
        @click="emit('toggle', row.index)"
      >
        <span class="cat-chap-ord">{{ row.ordinal }}</span>
        <span class="cat-chap-mark" :style="{ backgroundColor: row.chapter.color }"></span>
        <span class="cat-chap-title">{{ row.title }}</span>
        <span class="cat-chap-count">{{ t("railScripts", { n: row.total }) }}</span>
        <AppIcon class="cat-chap-arrow" name="chevron" />
      </button>
      <button
        v-else
        class="cat-row rail-vrow rail-vpos"
        :class="{ 'is-on': props.selectedId === row.id }"
        :style="{ top: `${top}px` }"
        type="button"
        :aria-current="props.selectedId === row.id ? 'true' : undefined"
        @click="emit('pick', row.id)"
      >
        <span class="cat-id">{{ row.id }}</span>
        <span class="cat-meta">{{ t("sayCount", { n: row.sayCount }) }}</span>
      </button>
    </template>
  </div>
  <p v-else class="cat-empty">{{ t("searchEmpty") }}</p>
</template>
