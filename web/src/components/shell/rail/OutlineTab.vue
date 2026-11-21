<script setup lang="ts">
import type { RailRow } from "../../../lib/rail";
import { t } from "../../../i18n";

const props = defineProps<{
  items: { row: RailRow; top: number; index: number }[];
  height: number;
  selectedId: string;
  searching: boolean;
  measure: (element: Element | null) => void;
}>();

const emit = defineEmits<{
  (event: "toggle", index: number): void;
  (event: "pick", id: string): void;
}>();

const setRef = (element: Element | ComponentPublicInstance | null) => {
  props.measure(element instanceof Element ? element : null);
};
</script>

<template>
  <div v-if="props.items.length" class="rail-vlist" :style="{ height: `${props.height}px` }">
    <template v-for="{ row, top, index } in props.items" :key="row.key">
      <button
        v-if="row.kind === 'chapter'"
        :ref="setRef"
        :data-index="index"
        class="cat-chap rail-vpos"
        :class="{ 'is-open': row.open, 'is-solo': row.solo }"
        :style="{ top: `${top}px` }"
        type="button"
        :disabled="props.searching"
        :aria-expanded="row.open"
        @click="emit('toggle', row.index)"
      >
        <AppIcon class="cat-chap-arrow" name="chevron" />
        <span class="cat-chap-title">{{ row.title }}</span>
      </button>
      <button
        v-else
        :ref="setRef"
        :data-index="index"
        class="cat-row rail-vrow rail-vpos"
        :class="{ 'is-on': props.selectedId === row.id, 'is-card-end': row.last }"
        :style="{ top: `${top}px` }"
        type="button"
        :aria-current="props.selectedId === row.id ? 'true' : undefined"
        @click="emit('pick', row.id)"
      >
        <span class="cat-id">{{ row.id }}</span>
      </button>
    </template>
  </div>
  <p v-else class="cat-empty">{{ t("searchEmpty") }}</p>
</template>
