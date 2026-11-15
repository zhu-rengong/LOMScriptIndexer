<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: "neutral" | "accent" | "warn" | "danger";
    size?: "sm" | "md" | "xs";
    variant?: "boxed" | "plain";
    as?: string;
  }>(),
  { tone: "neutral", size: "md", variant: "boxed", as: "span" },
);
</script>

<template>
  <component :is="as" class="tag" :data-tone="tone" :data-size="size" :data-variant="variant">
    <slot />
  </component>
</template>
