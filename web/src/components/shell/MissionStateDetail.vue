<script setup lang="ts">
import { names } from "../../data/names";
import { t } from "../../i18n";
import type { MissionRecord, MissionState } from "../../types/missions";
import MissionStateBody from "../reader/MissionStateBody.vue";

const props = defineProps<{
  missionId: string;
  stateKey: string;
  state: MissionState;
  record: MissionRecord | null;
}>();

const missionName = computed(() => {
  if (props.record?.main) return t("missionMain");
  const value = names.label("mission", props.missionId);
  return value && value !== props.missionId ? value : props.missionId;
});

const note = computed(() => {
  const value = names.label("missionState", props.stateKey);
  return value && value !== props.stateKey ? value : "";
});

const heading = computed(() =>
  note.value ? `${missionName.value} · ${note.value}` : missionName.value,
);
</script>

<template>
  <div class="mission-detail">
    <p class="mission-heading">{{ heading }}</p>
    <MissionStateBody :state="state" />
  </div>
</template>
