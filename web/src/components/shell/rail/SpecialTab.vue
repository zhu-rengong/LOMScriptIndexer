<script setup lang="ts">
import { t } from "../../../i18n";
import type { SpecialRow } from "../../../lib/rail";
import EmptyState from "../../ui/EmptyState.vue";
import ListRow from "../../ui/ListRow.vue";

const props = defineProps<{
  rows: SpecialRow[];
  selectedId: string;
}>();

const emit = defineEmits<{
  (event: "pick", id: string): void;
}>();

const pick = (row: SpecialRow) => {
  if (!row.known) return;
  emit("pick", row.id);
};
</script>

<template>
  <template v-if="props.rows.length">
    <ListRow
      v-for="row in props.rows"
      :key="row.id"
      class="cat-row cat-special"
      density="compact"
      :active="props.selectedId === row.id"
      :disabled="!row.known"
      @click="pick(row)"
    >
      <span class="cat-name">{{ row.name }}</span>
      <span class="cat-code">{{ row.id }}</span>
    </ListRow>
  </template>
  <EmptyState v-else :title="t('searchEmpty')" />
</template>
