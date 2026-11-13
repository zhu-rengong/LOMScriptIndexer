<script setup lang="ts">
import { t } from "../../i18n";
import type { MissionTriggerView } from "../../types/beats";

const props = defineProps<{ trigger: MissionTriggerView }>();

const title = computed(() => [props.trigger.name, props.trigger.key].filter(Boolean).join(" · "));
</script>

<template>
  <div
    class="mission-trigger"
    :class="{ 'is-cancel': !trigger.active }"
    :title="title || undefined"
  >
    <div class="battle-head">
      <div class="battle-head-main">
        <div class="battle-head-line">
          <span class="cx-var">
            <span class="cx-type">
              {{ t(trigger.active ? "missionTriggerTag" : "missionTriggerCancelTag") }}
            </span>
            <span v-if="trigger.name" class="cx-name">{{ trigger.name }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
