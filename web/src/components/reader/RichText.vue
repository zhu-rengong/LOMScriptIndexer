<script setup lang="ts">
import { parseRichText } from "../../lib/richText";

const props = defineProps<{ text: string }>();

const segments = computed(() => parseRichText(props.text));
</script>

<template>
  <template v-for="(segment, index) in segments" :key="index">
    <span v-if="segment.scale !== 1" :style="{ fontSize: `${segment.scale.toFixed(2)}em` }">{{
      segment.text
    }}</span>
    <template v-else>{{ segment.text }}</template>
  </template>
</template>
