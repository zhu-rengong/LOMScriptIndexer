<script setup lang="ts">
import { t } from "../../../i18n";
import type { BookmarkRow } from "../../../lib/rail";
import AppIcon from "../../ui/AppIcon.vue";
import ConfirmPrompt from "../../ui/ConfirmPrompt.vue";
import EmptyState from "../../ui/EmptyState.vue";
import ListRow from "../../ui/ListRow.vue";

const props = defineProps<{
  rows: BookmarkRow[];
  selectedId: string;
  searching: boolean;
}>();

const emit = defineEmits<{
  (event: "pick", id: string): void;
  (event: "remove", id: string): void;
  (event: "clear"): void;
}>();

const pick = (row: BookmarkRow) => {
  if (!row.known) return;
  emit("pick", row.id);
};
</script>

<template>
  <template v-if="props.rows.length">
    <ListRow
      v-for="row in props.rows"
      :key="row.id"
      class="cat-row cat-book-row"
      density="compact"
      :active="props.selectedId === row.id"
      :disabled="!row.known"
      :data-index="row.index"
      @click="pick(row)"
    >
      <span class="cat-id">{{ row.id }}</span>
      <span v-if="row.chapter" class="cat-meta">{{ row.chapter }}</span>
      <button
        class="btn btn-icon row-action"
        data-size="sm"
        type="button"
        :title="t('bookmarkRemove')"
        :aria-label="t('bookmarkRemove')"
        @click.stop="emit('remove', row.id)"
      >
        <AppIcon name="close" />
      </button>
    </ListRow>
    <div class="cat-clear">
      <ConfirmPrompt
        :label="t('bookmarkClear')"
        :prompt="t('confirmClearBookmarks')"
        tone="danger"
        @confirm="emit('clear')"
      />
    </div>
  </template>
  <EmptyState v-else :title="t(props.searching ? 'searchEmpty' : 'bookmarkEmpty')" />
</template>
