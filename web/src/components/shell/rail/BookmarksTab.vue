<script setup lang="ts">
import { t } from "../../../i18n";
import type { BookmarkRow } from "../../../lib/rail";
import AppIcon from "../../ui/AppIcon.vue";

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
</script>

<template>
  <template v-if="props.rows.length">
    <div
      v-for="row in props.rows"
      :key="row.id"
      class="cat-book"
      :class="{ 'is-on': props.selectedId === row.id }"
    >
      <button
        class="cat-book-main"
        type="button"
        :disabled="!row.known"
        :data-index="row.index"
        :aria-current="props.selectedId === row.id ? 'true' : undefined"
        @click="emit('pick', row.id)"
      >
        <span class="cat-id">{{ row.id }}</span>
        <span v-if="row.chapter" class="cat-meta">{{ row.chapter }}</span>
      </button>
      <button
        class="cat-del"
        type="button"
        :title="t('bookmarkRemove')"
        :aria-label="t('bookmarkRemove')"
        @click.stop="emit('remove', row.id)"
      >
        <AppIcon name="close" />
      </button>
    </div>
    <button class="cat-clear" type="button" @click="emit('clear')">
      {{ t("bookmarkClear") }}
    </button>
  </template>
  <p v-else class="cat-empty">{{ t(props.searching ? "searchEmpty" : "bookmarkEmpty") }}</p>
</template>
