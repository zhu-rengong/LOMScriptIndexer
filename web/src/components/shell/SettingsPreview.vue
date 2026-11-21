<script setup lang="ts">
import { t } from "../../i18n";
import { slotById, slotsOfGroup } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";

const props = defineProps<{ target: FontTarget }>();

const specimens = computed(() => {
  if (props.target.scope === "slot") {
    const slot = slotById(props.target.id);
    return slot ? [slot] : [];
  }
  return slotsOfGroup(props.target.id);
});
</script>

<template>
  <div id="settingsPreview" class="preview">
    <div v-for="slot in specimens" :key="slot.id" class="preview-block">
      <div class="preview-head">
        <span class="preview-tag">{{ t(slot.label) }}</span>
      </div>
      <div class="preview-specimen">
        <TypeSpecimen :wrappers="slot.wrappers" :preview-text="t(slot.previewKey)" />
      </div>
    </div>
  </div>
</template>
