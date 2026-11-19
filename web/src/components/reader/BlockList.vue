<script setup lang="ts">
import { sayKindOf } from "../../lib/beatRows";
import type { ReaderBlock } from "../../types/beats";
import BattleCard from "./BattleCard.vue";
import BranchGroup from "./BranchGroup.vue";
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
    />
    <TimeLine v-else-if="block.kind === 'time'" :rounds="block.rounds" />
    <MetaChips v-else-if="block.kind === 'meta'" :chips="block.chips" />
    <MetaChips v-else-if="block.kind === 'dice'" :chips="block.chips" dice />
    <MissionEventCard v-else-if="block.kind === 'missionEvent'" :events="block.events" />
    <ChoiceBlock
      v-else-if="block.kind === 'choice'"
      :options="block.options"
      :dice-chips="block.diceChips"
      :fold-key="foldKeyOf(index)"
    />
    <BranchGroup
      v-else-if="block.kind === 'branches'"
      :branches="block.branches"
      :fold-key="foldKeyOf(index)"
    />
    <LoreLines v-else-if="block.kind === 'lore'" :lines="block.lines" />
    <BattleCard
      v-else-if="block.kind === 'battle'"
      :battle="block.battle"
      :fold-key="foldKeyOf(index)"
    />
    <EndingBlock v-else-if="block.kind === 'ending'" :ending="block.ending" />
    <SceneSwitch v-else-if="block.kind === 'scene'" :view="block.scene" />
    <JumpLink
      v-else-if="block.kind === 'jump'"
      :jump="block.jump"
      :fold-key="foldKeyOf(index)"
    />
  </template>
</template>
