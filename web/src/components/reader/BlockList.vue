<script setup lang="ts">
import { sayKindOf } from "../../lib/beatRows";
import type { BranchView, ReaderBlock } from "../../types/beats";
import type { Component } from "vue";
import BattleCard from "./BattleCard.vue";
import BranchBlock from "./BranchBlock.vue";
import ChoiceBlock from "./ChoiceBlock.vue";
import EndingBlock from "./EndingBlock.vue";
import JumpLink from "./JumpLink.vue";
import LoreLines from "./LoreLines.vue";
import MetaChips from "./MetaChips.vue";
import MissionEventCard from "./MissionEventCard.vue";
import SayLine from "./SayLine.vue";
import SceneSwitch from "./SceneSwitch.vue";
import TimeLine from "./TimeLine.vue";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const props = defineProps<{ blocks: ReaderBlock[]; path?: string }>();

const view = useViewStore();
const prefs = usePrefsStore();

const components: Record<string, Component> = {
  say: SayLine,
  time: TimeLine,
  meta: MetaChips,
  missionEvent: MissionEventCard,
  dice: MetaChips,
  choice: ChoiceBlock,
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

const branchKey = (branch: BranchView, position: number): string =>
  branch.check
    ? `${branch.check.kind}:${branch.check.key}:${branch.check.expectedResult ?? ""}`
    : `pos:${position}`;

const blockProps = (block: ReaderBlock, index: number): Record<string, unknown> => {
  switch (block.kind) {
    case "say":
      return {
        mode: block.mode,
        speaker: block.speaker,
        text: block.text,
        expression: block.expression || "",
        offstage: block.offstage === true,
        showPortrait: prefs.showPortraits,
      };
    case "time":
      return { rounds: block.rounds };
    case "meta":
      return { chips: block.chips };
    case "missionEvent":
      return { events: block.events };
    case "dice":
      return { chips: block.chips, dice: true };
    case "choice":
      return { options: block.options, diceChips: block.diceChips, foldKey: foldKeyOf(index) };
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
    default:
      return {};
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
  <template v-for="{ block, index } in visible" :key="`${block.kind}:${index}`">
    <div v-if="block.kind === 'branches'" class="branch-group">
      <BranchBlock
        v-for="(branch, position) in block.branches"
        :key="branchKey(branch, position)"
        :branch="branch"
        :fold-key="`${foldKeyOf(index)}/b${position}`"
      />
    </div>
    <component :is="components[block.kind]" v-else v-bind="blockProps(block, index)" />
  </template>
</template>
