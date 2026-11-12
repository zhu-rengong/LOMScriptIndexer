<script setup lang="ts">
import type { MetaChip, MetaSeal } from "../../types/beats";
import AppIcon from "../ui/AppIcon.vue";
import { usePanelsStore } from "../../stores/panels";
import { useScriptStore } from "../../stores/script";

const panels = usePanelsStore();
const store = useScriptStore();

const props = defineProps<{ chips: MetaChip[]; dice?: boolean; method?: string }>();

const sealClass = (seal: MetaSeal): string | undefined =>
  seal === "infer" ? undefined : `is-${seal}`;

const open = (chip: MetaChip, event: Event) => {
  if (!chip.target) return;
  event.stopPropagation();
  panels.openLookup(
    chip.target.kind,
    chip.target.key,
    event.currentTarget as HTMLElement,
    props.method || chip.target.method,
  );
};

const activate = (chip: MetaChip, event: Event) => {
  if (!chip.jump) {
    open(chip, event);
    return;
  }
  event.stopPropagation();
  store.select(chip.jump, { history: true });
};
</script>

<template>
  <div class="meta-group" :class="{ 'is-dice': dice }">
    <div class="meta-chips">
      <template v-for="(chip, index) in chips" :key="index">
        <button
          v-if="chip.target || chip.jump"
          class="btn btn-sm meta-action meta-chip"
          type="button"
          :class="{ 'is-hidden': chip.hidden }"
          :aria-haspopup="chip.target ? 'dialog' : undefined"
          :title="chip.title"
          :data-kind="chip.match?.kind"
          :data-key="chip.match?.key"
          @click="activate(chip, $event)"
        >
          <span
            v-if="chip.seal"
            class="infer-seal"
            :class="sealClass(chip.seal)"
            aria-hidden="true"
          >
            <span v-if="chip.seal === 'infer'">推</span>
            <AppIcon v-else :name="chip.seal === 'true' ? 'check' : 'close'" />
          </span>
          {{ chip.text }}
        </button>
        <span
          v-else
          class="chip-stat chip chip-sm meta-chip"
          :class="{ 'is-hidden': chip.hidden }"
          :title="chip.title"
          :data-kind="chip.match?.kind"
          :data-key="chip.match?.key"
        >
          <span
            v-if="chip.seal"
            class="infer-seal"
            :class="sealClass(chip.seal)"
            aria-hidden="true"
          >
            <span v-if="chip.seal === 'infer'">推</span>
            <AppIcon v-else :name="chip.seal === 'true' ? 'check' : 'close'" />
          </span>
          {{ chip.text }}
        </span>
      </template>
    </div>
  </div>
</template>
