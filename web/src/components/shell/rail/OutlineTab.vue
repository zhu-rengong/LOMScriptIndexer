<script setup lang="ts">
import { t } from "../../../i18n";
import { nodeIndexOf, type ChapterRow } from "../../../lib/rail";
import AppIcon from "../../ui/AppIcon.vue";

const props = defineProps<{
  rows: ChapterRow[];
  selectedId: string;
  searching: boolean;
}>();

const emit = defineEmits<{
  (event: "toggle", index: number): void;
  (event: "pick", id: string): void;
}>();
</script>

<template>
  <template v-if="props.rows.length">
    <template v-for="row in props.rows" :key="row.chapter.id">
      <button
        class="cat-chap"
        :class="{ 'is-open': row.open }"
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
      <div v-if="row.open" class="cat-entries">
        <button
          v-for="node in row.members"
          :key="node.id"
          class="cat-row"
          :class="{ 'is-on': props.selectedId === node.id }"
          type="button"
          :data-index="nodeIndexOf(node.id)"
          :aria-current="props.selectedId === node.id ? 'true' : undefined"
          @click="emit('pick', node.id)"
        >
          <span class="cat-id">{{ node.id }}</span>
          <span class="cat-meta">{{ t("sayCount", { n: node.sayCount }) }}</span>
        </button>
        <p v-if="row.hidden" class="cat-more">{{ t("previewMore", { n: row.hidden }) }}</p>
      </div>
    </template>
  </template>
  <p v-else class="cat-empty">{{ t("searchEmpty") }}</p>
</template>
