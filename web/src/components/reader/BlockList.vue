<script setup lang="ts">
import { sayKindOf } from "../../lib/beatRows";
import type { ReaderBlock } from "../../types/beats";
import type { Component } from "vue";
import BattleCard from "./BattleCard.vue";
import BranchGroup from "./BranchGroup.vue";
import ChoiceBlock from "./ChoiceBlock.vue";
import EndingBlock from "./EndingBlock.vue";
import JumpLink from "./JumpLink.vue";
import LoreLines from "./LoreLines.vue";
import MetaChips from "./MetaChips.vue";
import SayLine from "./SayLine.vue";
import SceneSwitch from "./SceneSwitch.vue";
import TimeLine from "./TimeLine.vue";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const props = defineProps<{ blocks: ReaderBlock[]; path?: string }>();

const view = useViewStore();
const prefs = usePrefsStore();

const components: Record<ReaderBlock["kind"], Component> = {
  say: SayLine,
  time: TimeLine,
  meta: MetaChips,
  dice: MetaChips,
  choice: ChoiceBlock,
  branches: BranchGroup,
  lore: LoreLines,
  battle: BattleCard,
  ending: EndingBlock,
  scene: SceneSwitch,
  jump: JumpLink,
};

const foldKeyOf = (index: number): string => {
  const base = props.path || "";
  return base ? `${base}/${index}` : String(index);
};

const blockProps = (block: ReaderBlock, index: number): Record<string, unknown> => {
  switch (block.kind) {
    case "say":
      return {
        mode: block.mode,
        speaker: block.speaker,
        text: block.text,
        expression: block.expression || "",
        showPortrait: prefs.showPortraits,
      };
    case "time":
      return { rounds: block.rounds };
    case "meta":
      return { chips: block.chips };
    case "dice":
      return { chips: block.chips, dice: true };
    case "choice":
      return { options: block.options, diceChips: block.diceChips, foldKey: foldKeyOf(index) };
    case "branches":
      return { branches: block.branches, foldKey: foldKeyOf(index) };
    case "lore":
      return { lines: block.lines };
    case "battle":
      return { battle: block.battle, foldKey: foldKeyOf(index) };
    case "ending":
      return { ending: block.ending };
    case "scene":
      return { view: block.scene };
    case "jump":
      return { jump: block.jump, foldKey: foldKeyOf(index) };
  }
};

const visible = computed(() =>
  props.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => {
      if (block.kind === "lore") return view.visibleKinds.lore;
      if (block.kind === "say") return view.visibleKinds[sayKindOf(block.mode)];
      return true;
    }),
);
</script>

<template>
  <component
    :is="components[block.kind]"
    v-for="{ block, index } in visible"
    :key="`${block.kind}:${index}`"
    v-bind="blockProps(block, index)"
  />
</template>
