<script setup lang="ts">
import type { ChoiceOption, MetaChip } from "../../types/beats";
import OptionBlock from "./OptionBlock.vue";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

defineProps<{ options: ChoiceOption[]; diceChips: MetaChip[]; foldKey: string }>();

const openDice = (chip: MetaChip, event: Event) => {
  if (!chip.target) return;
  event.stopPropagation();
  panels.openLookup(
    chip.target.kind,
    chip.target.key,
    event.currentTarget as HTMLElement,
    chip.target.method,
  );
};
</script>

<template>
  <div class="choice">
    <template v-for="(chip, index) in diceChips" :key="`dice-${index}`">
      <button
        v-if="chip.target"
        class="btn btn-sm meta-action"
        type="button"
        aria-haspopup="dialog"
        :title="chip.title"
        :data-kind="chip.match?.kind"
        :data-key="chip.match?.key"
        @click="openDice(chip, $event)"
      >
        {{ chip.text }}
      </button>
      <span
        v-else
        class="chip-stat chip chip-sm"
        :title="chip.title"
        :data-kind="chip.match?.kind"
        :data-key="chip.match?.key"
        >{{ chip.text }}</span
      >
    </template>
    <OptionBlock
      v-for="(option, position) in options"
      :key="option.index"
      :option="option"
      :index="option.index"
      :fold-key="`${foldKey}/o${position}`"
    />
  </div>
</template>
