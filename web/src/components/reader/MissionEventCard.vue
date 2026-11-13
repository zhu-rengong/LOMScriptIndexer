<script setup lang="ts">
import { t } from "../../i18n";
import type { MissionEventType, MissionEventView } from "../../types/beats";

const LABELS: Record<MissionEventType, string> = {
  trigger: "missionEventTrigger",
  cancel: "missionEventCancel",
  end: "missionEventEnd",
};

const props = defineProps<{ event: MissionEventView }>();

const title = computed(() => [props.event.name, props.event.code].filter(Boolean).join(" · "));
</script>

<template>
  <div
    class="mission-event"
    :class="{ 'is-cancel': event.type === 'cancel' }"
    :title="title || undefined"
  >
    <div class="battle-head">
      <div class="battle-head-main">
        <div class="battle-head-line">
          <span class="cx-var">
            <span class="cx-type">{{ t(LABELS[event.type]) }}</span>
            <span v-if="event.name" class="cx-name">{{ event.name }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
