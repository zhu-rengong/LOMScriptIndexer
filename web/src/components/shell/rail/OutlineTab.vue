<script setup lang="ts">
import { t } from "../../../i18n";
import { nodeIndexOf, type ChapterRow } from "../../../lib/rail";
import AppIcon from "../../ui/AppIcon.vue";
import EmptyState from "../../ui/EmptyState.vue";
import ListRow from "../../ui/ListRow.vue";

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
      <ListRow
        class="cat-chap"
        density="comfortable"
        :active="row.open"
        :disabled="props.searching"
        :aria-expanded="row.open"
        @click="emit('toggle', row.index)"
      >
        <span class="cat-chap-ord">{{ row.ordinal }}</span>
        <span class="icon-mark" :style="{ color: row.chapter.color }"></span>
        <span class="cat-chap-title">{{ row.title }}</span>
        <span class="cat-chap-count">{{ t("railScripts", { n: row.total }) }}</span>
        <AppIcon class="cat-chap-arrow" name="chevron" />
      </ListRow>
      <div v-if="row.open" class="cat-entries">
        <ListRow
          v-for="node in row.members"
          :key="node.id"
          class="cat-row"
          density="compact"
          :active="props.selectedId === node.id"
          :data-index="nodeIndexOf(node.id)"
          @click="emit('pick', node.id)"
        >
          <span class="cat-id">{{ node.id }}</span>
          <span class="cat-meta">{{ t("sayCount", { n: node.sayCount }) }}</span>
        </ListRow>
        <p v-if="row.hidden" class="cat-more">{{ t("previewMore", { n: row.hidden }) }}</p>
      </div>
    </template>
  </template>
  <EmptyState v-else :title="t('searchEmpty')" />
</template>
