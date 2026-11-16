<script setup lang="ts">
import type { UseVirtualListItem } from "@vueuse/core";
import type { StyleValue } from "vue";
import { t } from "../../../i18n";
import type { RailRow } from "../../../lib/rail";
import AppIcon from "../../ui/AppIcon.vue";

const props = defineProps<{
  items: UseVirtualListItem<RailRow>[];
  wrapperStyle: StyleValue;
  selectedId: string;
  searching: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle", index: number): void;
  (event: "pick", id: string): void;
}>();
</script>

<template>
  <div v-if="props.items.length" class="rail-vlist" :style="props.wrapperStyle">
    <template v-for="{ data } in props.items" :key="data.key">
      <button
        v-if="data.kind === 'chapter'"
        class="cat-chap"
        :class="{ 'is-open': data.open }"
        type="button"
        :disabled="props.searching"
        :aria-expanded="data.open"
        @click="emit('toggle', data.index)"
      >
        <span class="cat-chap-ord">{{ data.ordinal }}</span>
        <span class="cat-chap-mark" :style="{ backgroundColor: data.chapter.color }"></span>
        <span class="cat-chap-title">{{ data.title }}</span>
        <span class="cat-chap-count">{{ t("railScripts", { n: data.total }) }}</span>
        <AppIcon class="cat-chap-arrow" name="chevron" />
      </button>
      <button
        v-else
        class="cat-row rail-vrow"
        :class="{ 'is-on': props.selectedId === data.id }"
        type="button"
        :aria-current="props.selectedId === data.id ? 'true' : undefined"
        @click="emit('pick', data.id)"
      >
        <span class="cat-id">{{ data.id }}</span>
        <span class="cat-meta">{{ t("sayCount", { n: data.sayCount }) }}</span>
      </button>
    </template>
  </div>
  <p v-else class="cat-empty">{{ t("searchEmpty") }}</p>
</template>
