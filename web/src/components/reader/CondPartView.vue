<script setup lang="ts">
import { useLookupPress } from "../../composables/useLookupPress";
import type { ConditionPart } from "../../lib/conditions";

const panels = usePanelsStore();

const props = defineProps<{
  part: ConditionPart;
  method?: string;
}>();

const isText = (part: ConditionPart): part is { text: string } => "text" in part;

const openLookup = (target: HTMLElement | null): boolean => {
  const part = props.part;
  if (isText(part) || !part.lookup || !target) return false;
  panels.openLookup(part.lookup.kind, part.lookup.key, target, props.method);
  return true;
};

const { target, consume } = useLookupPress(openLookup);

const onClick = (event: MouseEvent): void => {
  const part = props.part;
  if (isText(part) || !part.lookup) return;
  const pointerType = event instanceof PointerEvent ? event.pointerType : "mouse";
  if (pointerType !== "mouse") {
    if (!consume()) return;
    event.stopPropagation();
    event.preventDefault();
    return;
  }
  event.stopPropagation();
  event.preventDefault();
  openLookup(target.value);
};

const onKey = (event: KeyboardEvent): void => {
  event.preventDefault();
  event.stopPropagation();
  openLookup(target.value);
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
    ref="target"
    :class="part.className"
    type="button"
    :title="part.title"
    :role="part.role"
    :data-kind="part.lookup ? part.kind : undefined"
    :data-key="part.lookup ? part.lookup.key : undefined"
    :aria-label="part.title"
    @click="onClick"
    @keydown.enter="onKey"
    @keydown.space="onKey"
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
