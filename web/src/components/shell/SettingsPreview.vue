<script setup lang="ts">
import { t } from "../../i18n";
import { slotById, slotsOfGroup } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";
import TypeSpecimen from "./TypeSpecimen.vue";

const props = defineProps<{ target: FontTarget }>();

const typeIds = computed(() => {
  if (props.target.scope === "slot") return [props.target.id];
  return slotsOfGroup(props.target.id)
    .slice(0, 3)
    .map((slot) => slot.id);
});

const specimenOf = (slotId: string) => slotById(slotId) || null;
</script>

<template>
  <div id="settingsPreview" class="preview">
    <template v-for="slotId in typeIds" :key="slotId">
      <template v-if="specimenOf(slotId)">
        <div class="preview-head">
          <span class="preview-tag">{{ t(specimenOf(slotId)!.label) }}</span>
        </div>
        <div class="preview-specimen">
          <TypeSpecimen
            :wrappers="specimenOf(slotId)!.wrappers"
            :preview-text="t(specimenOf(slotId)!.previewKey)"
          />
        </div>
      </template>
    </template>
  </div>
</template>
