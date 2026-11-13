<script setup lang="ts">
import { missions } from "../../data/missions";
import { t } from "../../i18n";
import type { MissionEventType, MissionEventView } from "../../types/beats";
import MissionStateBody from "./MissionStateBody.vue";

const LABELS: Record<MissionEventType, string> = {
  trigger: "missionEventTrigger",
  cancel: "missionEventCancel",
  end: "missionEventEnd",
};

const props = defineProps<{ event: MissionEventView }>();

const hit = computed(() =>
  props.event.type === "trigger" ? missions.missionOfState(props.event.code) : null,
);

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
    <MissionStateBody v-if="hit" :state="hit.state" />
  </div>
</template>
