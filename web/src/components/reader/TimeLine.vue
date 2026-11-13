<script setup lang="ts">
import { timeText } from "../../i18n";
import AppIcon from "../ui/AppIcon.vue";

defineProps<{ rounds: number }>();
</script>

<template>
  <div class="time-mark">
    <AppIcon name="clock" class="time-icon" />
    <span class="time-value">{{ timeText(rounds) }}</span>
  </div>
</template>
