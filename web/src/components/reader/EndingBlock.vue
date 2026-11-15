<script setup lang="ts">
import { t } from "../../i18n";
import type { EndingView } from "../../types/beats";
import RichText from "./RichText.vue";

defineProps<{ ending: EndingView }>();
</script>

<template>
  <div class="ending">
    <div class="ending-head">
      <span class="ending-label">{{ t("deathEnding") }}</span>
      <span v-if="ending.title" class="ending-title">{{ ending.title }}</span>
    </div>
    <div v-if="ending.desc" class="ending-desc">
      <div class="ending-text"><RichText :text="ending.desc" hard-breaks /></div>
    </div>
  </div>
</template>
