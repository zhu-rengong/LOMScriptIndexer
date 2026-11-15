<script setup lang="ts">
import AppIcon from "./AppIcon.vue";

withDefaults(
  defineProps<{
    title?: string;
    summary?: string;
    headingId?: string;
    closeId?: string;
    closeTitle?: string;
    closable?: boolean;
  }>(),
  { title: "", summary: "", headingId: "", closeId: "", closeTitle: "Close", closable: true },
);

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <header class="panel-head">
    <div class="panel-head-text">
      <h2 v-if="title" :id="headingId || undefined" class="panel-title">{{ title }}</h2>
      <p v-if="summary" class="panel-summary">{{ summary }}</p>
      <slot />
    </div>
    <button
      v-if="closable"
      :id="closeId || undefined"
      class="btn btn-icon panel-close"
      type="button"
      :title="closeTitle"
      :aria-label="closeTitle"
      @click="emit('close')"
    >
      <AppIcon name="close" />
    </button>
  </header>
</template>
