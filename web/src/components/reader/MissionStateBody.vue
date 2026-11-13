<script setup lang="ts">
import { graph } from "../../data/graph";
import { names } from "../../data/names";
import { t } from "../../i18n";
import { usePanelsStore } from "../../stores/panels";
import { useScriptStore } from "../../stores/script";
import type {
  MissionDialog,
  MissionFlagChange,
  MissionState,
  MissionTime,
} from "../../types/missions";
import CondExpr from "./CondExpr.vue";

const props = defineProps<{ state: MissionState }>();

const store = useScriptStore();
const panels = usePanelsStore();

const stageText = (stage: number): string =>
  t(`missionStage.${stage}`, { defaultValue: String(stage) });

const pointText = (time: MissionTime | null): string => {
  if (!time || !time.year) return "";
  return t("missionTimePoint", {
    year: time.year,
    month: time.month,
    stage: stageText(time.stage),
  });
};

const timeText = computed(() => {
  const rule = props.state.time;
  if (!rule.check) return t("missionTimeNone");
  if (rule.type === 1) return pointText(rule.specific) || t("missionPanelNone");
  if (rule.type === 2) {
    const from = pointText(rule.min);
    const to = pointText(rule.max);
    if (!from && !to) return t("missionPanelNone");
    return t("missionTimeRange", { from: from || "—", to: to || "—" });
  }
  if (rule.type === 3) return t("missionTimePeriod", { stage: stageText(rule.period) });
  return t("missionPanelNone");
});

const positionText = computed(() => {
  const code = props.state.positionCode;
  if (!code) return t("missionPanelNone");
  const value = names.label("missionPosition", code);
  return value && value !== code ? value : code;
});

const flagLabel = (change: MissionFlagChange): string => {
  if (change.note) return change.note;
  const value = names.label("flag", change.key);
  return value && value !== change.key ? value : change.key;
};

const dialogText = (dialog: MissionDialog): string => {
  const value = names.label("missionDialog", dialog.key);
  return value && value !== dialog.key ? value : dialog.key;
};

const portraitText = (dialog: MissionDialog): string =>
  dialog.portrait && dialog.portrait !== "normal" ? dialog.portrait : "";

const canJump = (id: string): boolean => !!id && graph.nodeById.has(id);

const go = (id: string) => {
  if (!canJump(id)) return;
  panels.hideLookup();
  store.select(id, { history: true });
};
</script>

<template>
  <div class="mission-body">
    <div v-if="!state.active || state.beforeMain" class="mission-tags">
      <span v-if="!state.active" class="mission-tag is-warn">{{ t("missionPanelInactive") }}</span>
      <span v-if="state.beforeMain" class="mission-tag">{{ t("missionPanelBeforeMain") }}</span>
    </div>

    <dl class="mission-rows">
      <div class="mission-row">
        <dt class="mission-label">{{ t("missionPanelStart") }}</dt>
        <dd class="mission-value">
          <button
            v-if="canJump(state.start)"
            class="mission-link btn btn-sm"
            type="button"
            @click="go(state.start)"
          >
            {{ state.start }}
          </button>
          <span v-else>{{ state.start || t("missionPanelNone") }}</span>
        </dd>
      </div>
      <div class="mission-row">
        <dt class="mission-label">{{ t("missionPanelNext") }}</dt>
        <dd class="mission-value">{{ state.next || t("missionPanelNone") }}</dd>
      </div>
      <div class="mission-row">
        <dt class="mission-label">{{ t("missionPanelTime") }}</dt>
        <dd class="mission-value">{{ timeText }}</dd>
      </div>
      <div class="mission-row">
        <dt class="mission-label">{{ t("missionPanelPosition") }}</dt>
        <dd class="mission-value">{{ positionText }}</dd>
      </div>
      <div class="mission-row">
        <dt class="mission-label">{{ t("missionPanelConditions") }}</dt>
        <dd class="mission-value">
          <p v-if="!state.conditions.length" class="mission-muted">
            {{ t("missionPanelNoConditions") }}
          </p>
          <div v-for="(item, index) in state.conditions" :key="index" class="mission-cond">
            <span v-if="item.note" class="mission-cond-note">{{ item.note }}</span>
            <CondExpr :expr="item.expr" />
          </div>
        </dd>
      </div>
      <div v-if="state.modifyFlagsTrue.length || state.modifyFlagsFalse.length" class="mission-row">
        <dt class="mission-label">{{ t("missionPanelFlags") }}</dt>
        <dd class="mission-value">
          <div v-if="state.modifyFlagsTrue.length" class="mission-flags">
            <span class="mission-sub-label">{{ t("missionPanelFlagsTrue") }}</span>
            <span
              v-for="(change, index) in state.modifyFlagsTrue"
              :key="`true-${index}`"
              class="mission-flag"
            >
              {{ t("metaAssign", { name: flagLabel(change), value: change.value }) }}
            </span>
          </div>
          <div v-if="state.modifyFlagsFalse.length" class="mission-flags">
            <span class="mission-sub-label">{{ t("missionPanelFlagsFalse") }}</span>
            <span
              v-for="(change, index) in state.modifyFlagsFalse"
              :key="`false-${index}`"
              class="mission-flag"
            >
              {{ t("metaAssign", { name: flagLabel(change), value: change.value }) }}
            </span>
          </div>
        </dd>
      </div>
      <div v-if="state.startDialogs.length" class="mission-row">
        <dt class="mission-label">{{ t("missionPanelDialogs") }}</dt>
        <dd class="mission-value">
          <p v-for="(dialog, index) in state.startDialogs" :key="index" class="mission-dialog">
            <span v-if="portraitText(dialog)" class="mission-portrait">{{
              portraitText(dialog)
            }}</span>
            <span>{{ dialogText(dialog) }}</span>
          </p>
        </dd>
      </div>
      <div v-if="state.alertDialogs.length" class="mission-row">
        <dt class="mission-label">{{ t("missionPanelAlertDialogs") }}</dt>
        <dd class="mission-value">
          <p v-for="(dialog, index) in state.alertDialogs" :key="index" class="mission-dialog">
            <span v-if="portraitText(dialog)" class="mission-portrait">{{
              portraitText(dialog)
            }}</span>
            <span>{{ dialogText(dialog) }}</span>
          </p>
        </dd>
      </div>
    </dl>
  </div>
</template>
