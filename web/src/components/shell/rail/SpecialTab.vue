<script setup lang="ts">
import { t } from "../../../i18n";
import type { SpecialRow } from "../../../lib/rail";

const props = defineProps<{
  rows: SpecialRow[];
  selectedId: string;
}>();

const emit = defineEmits<{
  (event: "pick", id: string): void;
}>();
</script>

<template>
  <template v-if="props.rows.length">
    <button
      v-for="row in props.rows"
      :key="row.id"
      class="cat-row cat-special"
      :class="{ 'is-on': props.selectedId === row.id }"
      type="button"
      :disabled="!row.known"
      :aria-current="props.selectedId === row.id ? 'true' : undefined"
      @click="emit('pick', row.id)"
    >
      <span class="cat-name">{{ row.name }}</span>
      <span class="cat-code">{{ row.id }}</span>
    </button>
  </template>
  <p v-else class="cat-empty">{{ t("searchEmpty") }}</p>
</template>
