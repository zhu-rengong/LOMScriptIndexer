<script setup lang="ts">
import { t } from "../../i18n";
import type { EndingView } from "../../types/beats";

defineProps<{ ending: EndingView }>();
</script>

<template>
  <div class="ending">
    <div class="ending-head">
      <span class="ending-label">{{ t("deathEnding") }}</span>
      <span v-if="ending.title" class="ending-title">{{ ending.title }}</span>
    </div>
    <div v-if="ending.desc.length" class="ending-desc">
      <p v-for="(line, index) in ending.desc" :key="index" class="ending-line">{{ line }}</p>
    </div>
  </div>
</template>
