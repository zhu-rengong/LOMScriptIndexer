<script setup lang="ts">
import { t } from "../../i18n";
import type { BattleView } from "../../types/beats";
import AppIcon from "../ui/AppIcon.vue";
import BattleEvent from "./BattleEvent.vue";
import JumpLink from "./JumpLink.vue";
import { useFoldMemory } from "../../composables/useFoldable";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{ battle: BattleView; foldKey: string }>();

const open = ref(false);

useFoldMemory(props.foldKey, open);

const isCampaign = computed(() => props.battle.kind === "battle");

const isStaticDuel = computed(() => !isCampaign.value && props.battle.events.length === 0);

const isExpandable = computed(() => !isCampaign.value && !isStaticDuel.value);

const rootClass = computed(() => {
  if (isCampaign.value) return "battle battle-campaign";
  if (isStaticDuel.value) return "battle battle-static";
  return open.value ? "battle is-open" : "battle";
});

const headAttrs = computed(() =>
  isExpandable.value ? { role: "button", tabindex: 0, "aria-expanded": open.value } : {},
);

const facts = computed(() =>
  props.battle.facts.map((fact) => {
    const parts = fact.match(/^(\S+)\s+(.*)$/);
    return parts ? { label: parts[1], value: parts[2] } : { label: "", value: fact };
  }),
);

const rowGroups = computed(() => {
  const groups: { label: string; values: string[] }[] = [];
  for (const row of props.battle.rows) {
    const last = groups[groups.length - 1];
    if (last && last.label === row.label) last.values.push(row.value);
    else groups.push({ label: row.label, values: [row.value] });
  }
  return groups;
});

const toggle = () => {
  if (!isExpandable.value) return;
  open.value = !open.value;
};

const reveal = () => {
  if (isExpandable.value) open.value = true;
};

const onHeadClick = (event: MouseEvent) => {
  if (!isExpandable.value) return;
  const target = event.target as HTMLElement | null;
  if (target && target.closest && target.closest("button")) return;
  toggle();
};

const onHeadKey = (event: KeyboardEvent) => {
  if (!isExpandable.value) return;
  if (event.target !== event.currentTarget) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  toggle();
};

const openSpeaker = (event: Event) => {
  if (!props.battle.speaker) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup("speaker", props.battle.speaker, event.currentTarget as HTMLElement);
};
</script>

<template>
  <div :class="rootClass" :data-reveal="isExpandable ? '' : undefined" @reveal="reveal">
    <component
      :is="isExpandable ? 'div' : 'dl'"
      :class="isExpandable ? 'branch-head battle-head card-row' : 'mission-rows battle-rows'"
      v-bind="headAttrs"
      @click="onHeadClick"
      @keydown="onHeadKey"
    >
      <template v-if="isExpandable">
        <div class="battle-head-main">
          <div class="battle-head-line">
            <span class="cx-var">
              <span class="cx-meta cx-type">
                {{ t(battle.kind === "combat" ? "battleDuel" : "battleCampaign") }}
              </span>
              <span v-if="battle.note" class="cx-name">{{ battle.note }}</span>
            </span>
          </div>

          <div v-if="battle.goals.length" class="battle-head-line">
            <span v-for="(goal, index) in battle.goals" :key="`goal-${index}`" class="cx-var">
              <span class="cx-meta cx-type">{{ t("battleGoalType") }}</span>
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
              <span class="cx-meta cx-type">{{ t("battleOpponentType") }}</span>
              <span class="cx-name">{{ battle.title }}</span>
            </span>
            <span
              v-for="(fact, index) in battle.facts"
              :key="`fact-${index}`"
              class="battle-fact"
              >{{ fact }}</span
            >
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
              class="battle-link is-link"
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

    <div v-if="isCampaign && battle.events.length" class="battle-campaign-events">
      <BattleEvent v-for="(event, index) in battle.events" :key="index" :event="event" />
    </div>

    <div v-if="isExpandable" class="battle-body">
      <BattleEvent v-for="(event, index) in battle.events" :key="index" :event="event" />
    </div>

    <div v-if="isExpandable && battle.afterScript" class="scene-switch">
      <span class="scene-label">{{ t("battleAfterStory") }}</span>
      <JumpLink :jump="{ target: battle.afterScript, dynamicSource: '' }" />
    </div>
    <div v-else-if="isExpandable && battle.nextScene" class="scene-switch">
      <span class="scene-label">{{ t("battleAfter") }}</span>
      <AppIcon name="arrow-right" class="scene-arrow" />
      <span class="scene-next">{{ battle.nextScene }}</span>
    </div>
  </div>
</template>
