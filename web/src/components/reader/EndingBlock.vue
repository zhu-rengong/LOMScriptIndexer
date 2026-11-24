<script setup lang="ts">
import { t } from "../../i18n";
import { endingLabelKey } from "../../lib/beatRows";
import type { EndingView } from "../../types/beats";

const props = defineProps<{ ending: EndingView; blockPath: string }>();

const label = computed(() => t(endingLabelKey(props.ending)));
</script>

<template>
  <div class="ending" :data-block-path="blockPath">
    <div class="ending-head">
      <span class="ending-label">{{ label }}</span>
      <span v-if="ending.title" class="ending-title">{{ ending.title }}</span>
    </div>
    <div v-if="ending.desc.length" class="ending-desc">
      <p v-for="(line, index) in ending.desc" :key="index" class="ending-line">{{ line }}</p>
    </div>
  </div>
</template>
