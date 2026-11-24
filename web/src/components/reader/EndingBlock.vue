<script setup lang="ts">
import { t } from "../../i18n";
import { endingLabelKey } from "../../lib/beatRows";
import type { EndingView } from "../../types/beats";

const props = defineProps<{ ending: EndingView; blockPath: string }>();

const isEndgame = computed(() => props.ending.kind === "endgame");
const label = computed(() => t(endingLabelKey(props.ending)));
</script>

<template>
  <div
    v-if="isEndgame"
    class="endgame"
    role="group"
    :aria-label="t('endgameEnding')"
    :data-block-path="blockPath"
  >
    <div v-if="ending.title" class="endgame-title">{{ ending.title }}</div>
    <div v-if="ending.desc.length" class="endgame-desc">
      <p v-for="(line, index) in ending.desc" :key="index" class="endgame-line">{{ line }}</p>
    </div>
  </div>
  <div v-else class="ending" :data-block-path="blockPath">
    <div class="ending-head">
      <span class="ending-label">{{ label }}</span>
      <span v-if="ending.title" class="ending-title">{{ ending.title }}</span>
    </div>
    <div v-if="ending.desc.length" class="ending-desc">
      <p v-for="(line, index) in ending.desc" :key="index" class="ending-line">{{ line }}</p>
    </div>
  </div>
</template>
