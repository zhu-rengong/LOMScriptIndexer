<script setup lang="ts">
import { t } from "../../i18n";
import type { BattleView } from "../../types/beats";
import AppIcon from "../ui/AppIcon.vue";
import BattleEvent from "./BattleEvent.vue";
import BattleHead from "./BattleHead.vue";
import JumpLink from "./JumpLink.vue";
import { useFoldMemory } from "../../composables/useFoldable";

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
</script>

<template>
  <div :class="rootClass" :data-reveal="isExpandable ? '' : undefined" @reveal="reveal">
    <BattleHead
      v-bind="headAttrs"
      :battle="battle"
      :expandable="isExpandable"
      @click="onHeadClick"
      @keydown="onHeadKey"
    />

    <div v-if="isCampaign && battle.events.length" class="battle-campaign-events">
      <BattleEvent v-for="(event, index) in battle.events" :key="index" :event="event" />
    </div>

    <div v-if="isExpandable" class="battle-body">
      <BattleEvent v-for="(event, index) in battle.events" :key="index" :event="event" />
    </div>

    <div v-if="battle.afterScript" class="scene-switch">
      <span class="scene-label">{{ t("battleAfterStory") }}</span>
      <JumpLink :jump="{ target: battle.afterScript, dynamicSource: '' }" />
    </div>
    <div v-else-if="battle.nextScene" class="scene-switch">
      <span class="scene-label">{{ t("battleAfter") }}</span>
      <AppIcon name="arrow-right" class="scene-arrow" />
      <span class="scene-next">{{ battle.nextScene }}</span>
    </div>
  </div>
</template>
