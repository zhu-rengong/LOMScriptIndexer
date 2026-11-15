<script setup lang="ts">
import { defineComponent, h, type Component, type PropType, type VNode } from "vue";
import { t } from "../../i18n";
import type { Wrapper } from "../../lib/fontTypes";
import { slotById, slotsOfGroup } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";

const nest = (wrappers: Wrapper[], text: string): VNode => {
  let node: VNode | string = text;
  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const wrapper = wrappers[index];
    node = h(wrapper.tag, { class: wrapper.cls }, [node]);
  }
  return node as VNode;
};

const Specimen: Component = defineComponent({
  name: "TypeSpecimen",
  props: {
    wrappers: { type: Array as PropType<Wrapper[]>, required: true },
    text: { type: String, required: true },
  },
  setup: (props) => () => nest(props.wrappers, props.text),
});

const props = defineProps<{ target: FontTarget }>();

const typeIds = computed(() => {
  if (props.target.scope === "slot") return [props.target.id];
  return slotsOfGroup(props.target.id)
    .slice(0, 3)
    .map((slot) => slot.id);
});

const specimenOf = (slotId: string) => slotById(slotId) || null;
</script>

<template>
  <div id="settingsPreview" class="preview">
    <template v-for="slotId in typeIds" :key="slotId">
      <template v-if="specimenOf(slotId)">
        <div class="preview-head">
          <span class="preview-tag">{{ t(specimenOf(slotId)!.label) }}</span>
        </div>
        <div class="preview-specimen">
          <Specimen
            :wrappers="specimenOf(slotId)!.wrappers"
            :text="t(specimenOf(slotId)!.previewKey)"
          />
        </div>
      </template>
    </template>
  </div>
</template>
