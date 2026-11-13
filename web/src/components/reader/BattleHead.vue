<script setup lang="ts">
import { t } from "../../i18n";
import type { BattleView } from "../../types/beats";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{ battle: BattleView; expandable: boolean }>();

const openSpeaker = (event: Event) => {
  if (!props.battle.speaker) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup("speaker", props.battle.speaker, event.currentTarget as HTMLElement);
};

const facts = computed(() =>
  props.battle.facts.map((fact) => {
    const parts = fact.match(/^(\S+)\s+(.*)$/);
    return parts ? { label: parts[1], value: parts[2] } : { label: "", value: fact };
  }),
);
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

        <div v-if="battle.goals.length" class="battle-head-line">
          <span v-for="(goal, index) in battle.goals" :key="`goal-${index}`" class="cx-var">
            <span class="cx-type">{{ t("battleGoalType") }}</span>
            <span class="cx-name">{{ goal }}</span>
          </span>
        </div>

        <div v-if="battle.title || battle.facts.length" class="battle-head-line">
          <span
            v-if="battle.title"
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
            <span class="cx-name">{{ battle.title }}</span>
          </span>
          <span v-for="(fact, index) in battle.facts" :key="`fact-${index}`" class="battle-fact">{{
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

      <div v-for="(goal, index) in battle.goals" :key="`goal-${index}`" class="mission-row">
        <dt class="mission-label">{{ t("battleGoalType") }}</dt>
        <dd class="mission-value">{{ goal }}</dd>
      </div>

      <div v-if="battle.title" class="mission-row">
        <dt class="mission-label">{{ t("battleOpponentType") }}</dt>
        <dd class="mission-value">
          <button
            v-if="battle.speaker"
            class="battle-link"
            type="button"
            aria-haspopup="dialog"
            :title="t('lookupSpeaker')"
            @click="openSpeaker"
            @keydown.enter.prevent="openSpeaker"
            @keydown.space.prevent="openSpeaker"
          >
            {{ battle.title }}
          </button>
          <span v-else>{{ battle.title }}</span>
        </dd>
      </div>

      <div v-for="(fact, index) in facts" :key="`fact-${index}`" class="mission-row">
        <dt class="mission-label">{{ fact.label }}</dt>
        <dd class="mission-value">{{ fact.value }}</dd>
      </div>

      <div v-for="(row, index) in battle.rows" :key="`row-${index}`" class="mission-row">
        <dt class="mission-label">{{ row.label }}</dt>
        <dd class="mission-value">{{ row.value }}</dd>
      </div>
    </template>
  </component>
</template>
