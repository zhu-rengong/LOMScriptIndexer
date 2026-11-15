<script setup lang="ts">
import type { Wrapper } from "../../lib/fontTypes";

defineProps<{ wrappers: Wrapper[]; previewText: string }>();
</script>

<template>
  <component :is="wrappers[0].tag" :class="wrappers[0].cls">
    <TypeSpecimen
      v-if="wrappers.length > 1"
      :wrappers="wrappers.slice(1)"
      :preview-text="previewText"
    />
    <template v-else>{{ previewText }}</template>
  </component>
</template>
