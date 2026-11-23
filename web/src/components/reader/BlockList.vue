<script setup lang="ts">
import { sayKindOf } from "../../lib/beatRows";
import type { ReaderBlock } from "../../types/beats";

const props = defineProps<{ blocks: ReaderBlock[]; path?: string }>();

const view = useViewStore();
const prefs = usePrefsStore();

const foldKeyOf = (index: number): string => {
  const base = props.path || "";
  return base ? `${base}/${index}` : String(index);
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
    <SayLine
      v-if="block.kind === 'say'"
      :mode="block.mode"
      :speaker="block.speaker"
      :text="block.text"
      :expression="block.expression || ''"
      :offstage="block.offstage === true"
      :show-portrait="prefs.showPortraits"
      :block-path="foldKeyOf(index)"
    />
    <TimeLine
      v-else-if="block.kind === 'time'"
      :rounds="block.rounds"
      :block-path="foldKeyOf(index)"
    />
    <MetaChips
      v-else-if="block.kind === 'meta'"
      :chips="block.chips"
      :block-path="foldKeyOf(index)"
    />
    <MetaChips
      v-else-if="block.kind === 'dice'"
      :chips="block.chips"
      :block-path="foldKeyOf(index)"
      dice
    />
    <MissionEventCard
      v-else-if="block.kind === 'missionEvent'"
      :event="block.event"
      :block-path="foldKeyOf(index)"
    />
    <ChoiceBlock
      v-else-if="block.kind === 'choice'"
      :options="block.options"
      :dice-chips="block.diceChips"
      :fold-key="foldKeyOf(index)"
      :block-path="foldKeyOf(index)"
    />
    <BranchGroup
      v-else-if="block.kind === 'branches'"
      :branches="block.branches"
      :fold-key="foldKeyOf(index)"
      :block-path="foldKeyOf(index)"
    />
    <LoreLines
      v-else-if="block.kind === 'lore'"
      :lines="block.lines"
      :block-path="foldKeyOf(index)"
    />
    <BattleCard
      v-else-if="block.kind === 'battle'"
      :battle="block.battle"
      :fold-key="foldKeyOf(index)"
      :block-path="foldKeyOf(index)"
    />
    <EndingBlock
      v-else-if="block.kind === 'ending'"
      :ending="block.ending"
      :block-path="foldKeyOf(index)"
    />
    <SceneSwitch
      v-else-if="block.kind === 'scene'"
      :view="block.scene"
      :block-path="foldKeyOf(index)"
    />
    <JumpLink
      v-else-if="block.kind === 'jump'"
      :jump="block.jump"
      :fold-key="foldKeyOf(index)"
      :block-path="foldKeyOf(index)"
    />
  </template>
</template>
