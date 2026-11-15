<script setup lang="ts">
import type { ConditionPart } from "../../lib/conditions";
import AppIcon from "../ui/AppIcon.vue";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{
  part: ConditionPart;
  method?: string;
}>();

const isText = (part: ConditionPart): part is { text: string } => "text" in part;

const onLookup = (event: Event) => {
  const part = props.part;
  if (isText(part) || !part.lookup) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup(
    part.lookup.kind,
    part.lookup.key,
    event.currentTarget as HTMLElement,
    props.method,
  );
};
</script>

<template>
  <template v-if="isText(part)">{{ part.text }}</template>
  <span
    v-else-if="part.htmlTag === 'span'"
    :class="part.className"
    :title="part.title"
    :aria-label="part.title"
  >
    <AppIcon v-if="part.icon" :name="part.icon" />
    <span v-if="part.seal" class="infer-seal" :class="`is-${part.seal}`" aria-hidden="true">
      <AppIcon :name="part.seal === 'true' ? 'check' : 'close'" />
    </span>
    <CondPartView
      v-for="(child, index) in part.children"
      :key="index"
      :part="child"
      :method="method"
    />
  </span>
  <button
    v-else
    :class="part.className"
    type="button"
    :title="part.title"
    :role="part.role"
    :data-kind="part.lookup ? part.kind : undefined"
    :data-key="part.lookup ? part.lookup.key : undefined"
    :aria-label="part.title"
    @click="onLookup"
    @keydown.enter.prevent="onLookup"
    @keydown.space.prevent="onLookup"
  >
    <AppIcon v-if="part.icon" :name="part.icon" />
    <span v-if="part.seal" class="infer-seal" :class="`is-${part.seal}`" aria-hidden="true">
      <AppIcon :name="part.seal === 'true' ? 'check' : 'close'" />
    </span>
    <CondPartView
      v-for="(child, index) in part.children"
      :key="index"
      :part="child"
      :method="method"
    />
  </button>
</template>
