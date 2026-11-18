<script setup lang="ts">
import { missions } from "../../data/missions";
import { t } from "../../i18n";
import { usePanelsStore } from "../../stores/panels";
import type { MissionEventType, MissionEventView } from "../../types/beats";
import type { MissionState } from "../../types/missions";
import MissionStateBody from "./MissionStateBody.vue";

const panels = usePanelsStore();

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
  lookupKey: string;
};

const props = defineProps<{ events: MissionEventView[] }>();

const allCancel = computed(() => props.events.every((event) => event.type === "cancel"));

const rows = computed<EventRow[]>(() =>
  props.events.map((event) => {
    const state =
      event.type === "trigger" ? (missions.missionOfState(event.code)?.state ?? null) : null;
    const lookupKey = state ? event.code : event.type === "end" ? event.code : "";
    return {
      event,
      cancel: event.type === "cancel",
      title: event.name,
      state,
      lookupKey,
    };
  }),
);

const leadOf = (row: EventRow) => ({
  label: t(LABELS[row.event.type]),
  value: row.event.name,
  cancel: row.cancel,
  title: row.title,
  lookupKey: row.lookupKey,
});

const openMission = (key: string, event: Event) => {
  event.stopPropagation();
  panels.openLookup("mission", key, event.currentTarget as HTMLElement);
};
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
            <dd class="mission-value">
              <button
                v-if="row.lookupKey"
                class="mission-link btn"
                type="button"
                aria-haspopup="dialog"
                @click="openMission(row.lookupKey, $event)"
              >
                {{ row.event.name }}
              </button>
              <template v-else>{{ row.event.name }}</template>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
