<script setup lang="ts">
import { onLongPress, useEventListener } from "@vueuse/core";
import type { MetaChip, MetaSeal } from "../../types/beats";

const panels = usePanelsStore();

const props = defineProps<{
  chips: MetaChip[];
  dice?: boolean;
  method?: string;
  blockPath: string;
}>();

const wrap = ref<HTMLElement | null>(null);
let peeked: HTMLElement | null = null;

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

const stopPeek = (): void => {
  if (!peeked) return;
  peeked.classList.remove("is-peeking");
  peeked = null;
};

onLongPress(
  wrap,
  (event) => {
    if (event.pointerType === "mouse") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const chip = target.closest(".meta-chip.is-hidden");
    if (!(chip instanceof HTMLElement) || !wrap.value?.contains(chip)) return;
    stopPeek();
    chip.classList.add("is-peeking");
    peeked = chip;
  },
  { delay: 350, distanceThreshold: 8 },
);

useEventListener(wrap, ["pointerup", "pointercancel", "pointerleave"], stopPeek);

useEventListener(wrap, "contextmenu", (event) => {
  if (peeked) event.preventDefault();
});
</script>

<template>
  <div class="meta-group" :class="{ 'is-dice': dice }" :data-block-path="blockPath">
    <div ref="wrap" class="meta-chips">
      <template v-for="(chip, index) in chips" :key="index">
        <button
          v-if="chip.target"
          class="btn meta-action meta-chip"
          type="button"
          :class="{ 'is-hidden': chip.hidden }"
          aria-haspopup="dialog"
          :title="chip.title"
          :data-kind="chip.match?.kind"
          :data-key="chip.match?.key"
          @click="open(chip, $event)"
        >
          <span
            v-if="chip.seal"
            class="infer-seal"
            :class="sealClass(chip.seal)"
            aria-hidden="true"
          >
            <AppIcon
              :name="chip.seal === 'infer' ? 'entails' : chip.seal === 'true' ? 'check' : 'close'"
            />
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
            <AppIcon
              :name="chip.seal === 'infer' ? 'entails' : chip.seal === 'true' ? 'check' : 'close'"
            />
          </span>
          {{ chip.text }}
        </span>
      </template>
    </div>
  </div>
</template>
