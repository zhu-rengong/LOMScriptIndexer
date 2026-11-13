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

const props = defineProps<{ events: MissionEventView[] }>();

const allCancel = computed(() => props.events.every((event) => event.type === "cancel"));

const rows = computed(() =>
  props.events.map((event) => ({
    event,
    cancel: event.type === "cancel",
    title: [event.name, event.code].filter(Boolean).join(" · "),
    state: event.type === "trigger" ? (missions.missionOfState(event.code)?.state ?? null) : null,
  })),
);
</script>

<template>
  <div class="mission-event" :class="{ 'is-cancel': allCancel }">
    <div class="mission-event-panel">
      <div v-for="(row, index) in rows" :key="index" class="mission-event-item">
        <div class="mission-row" :title="row.title || undefined">
          <span class="mission-label" :class="{ 'is-cancel': row.cancel }">
            {{ t(LABELS[row.event.type]) }}
          </span>
          <span class="mission-value">{{ row.event.name }}</span>
        </div>
        <MissionStateBody v-if="row.state" :state="row.state" :show-tags="false" />
      </div>
    </div>
  </div>
</template>
