<script setup lang="ts">
import { t } from "../../i18n";
import type { BattleView } from "../../types/beats";
import { battleText } from "../../lib/battleText";

const panels = usePanelsStore();

const props = defineProps<{ battle: BattleView; expandable: boolean }>();

const openSpeaker = (event: Event) => {
  if (!props.battle.speaker) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup("speaker", props.battle.speaker, event.currentTarget as HTMLElement);
};

const titleText = computed(() => battleText(props.battle.title));

const goalTexts = computed(() => props.battle.goals.map(battleText).filter(Boolean));

const factTexts = computed(() => props.battle.facts.map(battleText).filter(Boolean));

const factSummary = computed(() => factTexts.value.join(t("battle.joinList")));

const rowGroups = computed(() => {
  const groups: { label: string; values: string[] }[] = [];
  for (const row of props.battle.rows) {
    const label = battleText(row.label);
    const value = battleText(row.value);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.values.push(value);
    else groups.push({ label, values: [value] });
  }
  return groups;
});
</script>

<template>
  <component
    :is="expandable ? 'div' : 'dl'"
    :class="expandable ? 'branch-head battle-head row row-sm' : 'mission-rows battle-rows'"
  >
    <template v-if="expandable">
      <div class="battle-head-main">
        <div class="battle-head-line">
          <span class="cx-var">
            <span class="cx-type">
              {{ t(battle.kind === "combat" ? "battleDuel" : "battleCampaign") }}
            </span>
            <span v-if="battle.note" class="cx-name">{{ battle.note }}</span>
          </span>
        </div>

        <div v-if="goalTexts.length" class="battle-head-line">
          <span v-for="(goal, index) in goalTexts" :key="`goal-${index}`" class="cx-var">
            <span class="cx-type">{{ t("battleGoalType") }}</span>
            <span class="cx-name">{{ goal }}</span>
          </span>
        </div>

        <div v-if="titleText || factTexts.length" class="battle-head-line">
          <span
            v-if="titleText"
            class="cx-var"
            :class="{ 'is-link': !!battle.speaker }"
            :role="battle.speaker ? 'button' : undefined"
            :aria-haspopup="battle.speaker ? 'dialog' : undefined"
            :tabindex="battle.speaker ? 0 : undefined"
            :title="battle.speaker ? t('lookupSpeaker') : undefined"
            @click="openSpeaker"
            @keydown.enter.prevent="openSpeaker"
            @keydown.space.prevent="openSpeaker"
          >
            <span class="cx-type">{{ t("battleOpponentType") }}</span>
            <span class="cx-name">{{ titleText }}</span>
          </span>
          <span v-for="(fact, index) in factTexts" :key="`fact-${index}`" class="battle-fact">{{
            fact
          }}</span>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="mission-row">
        <dt class="mission-label">
          {{ t(battle.kind === "combat" ? "battleDuel" : "battleCampaign") }}
        </dt>
        <dd class="mission-value">{{ battle.note }}</dd>
      </div>

      <div v-for="(goal, index) in goalTexts" :key="`goal-${index}`" class="mission-row">
        <dt class="mission-label">{{ t("battleGoalType") }}</dt>
        <dd class="mission-value">{{ goal }}</dd>
      </div>

      <div v-if="titleText" class="mission-row">
        <dt class="mission-label">{{ t("battleOpponentType") }}</dt>
        <dd class="mission-value">
          <button
            v-if="battle.speaker"
            class="battle-link"
            type="button"
            aria-haspopup="dialog"
            :title="t('lookupSpeaker')"
            @click="openSpeaker"
          >
            {{ titleText }}
          </button>
          <span v-else>{{ titleText }}</span>
        </dd>
      </div>

      <div v-if="factTexts.length" class="mission-row">
        <dt class="mission-label">{{ t("battleFactsLabel") }}</dt>
        <dd class="mission-value">{{ factSummary }}</dd>
      </div>

      <div v-for="(group, index) in rowGroups" :key="`row-${index}`" class="mission-row">
        <dt class="mission-label">{{ group.label }}</dt>
        <dd class="mission-value">{{ group.values.join(` ${t("cxOr")} `) }}</dd>
      </div>

      <div v-if="battle.afterScript" class="mission-row">
        <dt class="mission-label">{{ t("battleAfterStory") }}</dt>
        <dd class="mission-value">
          <JumpLink :jump="{ target: battle.afterScript, dynamicSource: '' }" />
        </dd>
      </div>

      <div v-else-if="battle.nextScene" class="mission-row">
        <dt class="mission-label">{{ t("battleAfter") }}</dt>
        <dd class="mission-value">{{ battle.nextScene }}</dd>
      </div>
    </template>
  </component>
</template>
