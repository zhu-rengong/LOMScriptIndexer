<script setup lang="ts">
import { missions } from "../../data/missions";
import { t } from "../../i18n";
import { missionEventTarget } from "../../lib/conditions";
import type { MissionEventType, MissionEventView } from "../../types/beats";
import type { MissionState } from "../../types/missions";

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
  target: FocusTarget;
};

const props = defineProps<{ event: MissionEventView }>();

const row = computed<EventRow>(() => {
  const event = props.event;
  const state =
    event.type === "trigger" ? (missions.missionOfState(event.code)?.state ?? null) : null;
  return {
    event,
    cancel: event.type === "cancel",
    title: event.name,
    state,
    lookupKey: state ? event.code : event.type === "end" ? event.code : "",
    target: missionEventTarget(event),
  };
});

const lead = computed(() => ({
  label: t(LABELS[row.value.event.type]),
  value: row.value.event.name,
  cancel: row.value.cancel,
  title: row.value.title,
  lookupKey: row.value.lookupKey,
}));

const openMission = (key: string, event: Event) => {
  event.stopPropagation();
  panels.openLookup("mission", key, event.currentTarget as HTMLElement);
};
</script>

<template>
  <div
    class="mission-event"
    :class="{ 'is-cancel': row.cancel }"
    :data-kind="row.target.kind"
    :data-key="row.target.key"
  >
    <div class="mission-event-panel">
      <MissionStateBody v-if="row.state" :state="row.state" :show-tags="false" :lead="lead" />
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
</template>
