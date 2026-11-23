<script setup lang="ts">
import { timeText } from "../../i18n";

defineProps<{ rounds: number; blockPath: string }>();
</script>

<template>
  <div class="time-mark" :data-block-path="blockPath">
    <AppIcon name="clock" class="time-icon" />
    <span class="time-value">{{ timeText(rounds) }}</span>
  </div>
</template>
