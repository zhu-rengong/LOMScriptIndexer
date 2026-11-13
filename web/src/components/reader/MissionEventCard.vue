<script setup lang="ts">
import { missions } from "../../data/missions";
import { t } from "../../i18n";
import type { MissionEventType, MissionEventView } from "../../types/beats";
import type { MissionState } from "../../types/missions";
import MissionStateBody from "./MissionStateBody.vue";

const LABELS: Record<MissionEventType, string> = {
  trigger: "missionEventTrigger",
  cancel: "missionEventCancel",
  end: "missionEventEnd",
};

type EventRow = {
  event: MissionEventView;
  cancel: boolean;
  title: string;
  state: MissionState | null;
};

const props = defineProps<{ events: MissionEventView[] }>();

const allCancel = computed(() => props.events.every((event) => event.type === "cancel"));

const rows = computed<EventRow[]>(() =>
  props.events.map((event) => ({
    event,
    cancel: event.type === "cancel",
    title: [event.name, event.code].filter(Boolean).join(" · "),
    state: event.type === "trigger" ? (missions.missionOfState(event.code)?.state ?? null) : null,
  })),
);

const leadOf = (row: EventRow) => ({
  label: t(LABELS[row.event.type]),
  value: row.event.name,
  cancel: row.cancel,
  title: row.title,
});
</script>

<template>
  <div class="mission-event" :class="{ 'is-cancel': allCancel }">
    <div class="mission-event-panel">
      <div v-for="(row, index) in rows" :key="index" class="mission-event-item">
        <MissionStateBody
          v-if="row.state"
          :state="row.state"
          :show-tags="false"
          :lead="leadOf(row)"
        />
        <dl v-else class="mission-rows">
          <div class="mission-row" :title="row.title || undefined">
            <dt class="mission-label" :class="{ 'is-cancel': row.cancel }">
              {{ t(LABELS[row.event.type]) }}
            </dt>
            <dd class="mission-value">{{ row.event.name }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
