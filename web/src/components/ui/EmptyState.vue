<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: "hero" | "inline";
    icon?: string;
    title: string;
    description?: string;
    hint?: string;
    align?: "center" | "start";
  }>(),
  { variant: "inline", icon: "", description: "", hint: "", align: "center" },
);
</script>

<template>
  <div v-if="variant === 'hero'" class="empty-state">
    <span v-if="icon" class="empty-icon">{{ icon }}</span>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <p v-if="hint" class="hint-line">{{ hint }}</p>
    <slot />
  </div>
  <div v-else class="empty" :data-align="align">
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-hint">{{ description }}</p>
    <slot />
  </div>
</template>
