<script setup lang="ts">
import { condParts, type ConditionPart } from "../../lib/conditions";
import type { ConditionNode } from "../../types/condition";
import AppIcon from "../ui/AppIcon.vue";
import { usePanelsStore } from "../../stores/panels";

const panels = usePanelsStore();

const props = defineProps<{
  expr?: ConditionNode | null;
  part?: ConditionPart;
  method?: string;
}>();

const node = computed<ConditionPart>(() => props.part ?? condParts(props.expr || null));

const isText = (part: ConditionPart): part is { text: string } => "text" in part;

const onLookup = (event: Event) => {
  const current = props.part;
  if (!current || isText(current) || !current.lookup) return;
  event.stopPropagation();
  event.preventDefault();
  panels.openLookup(
    current.lookup.kind,
    current.lookup.key,
    event.currentTarget as HTMLElement,
    props.method,
  );
};
</script>

<template>
  <template v-if="isText(node)">{{ node.text }}</template>
  <span
    v-else-if="node.htmlTag === 'span'"
    :class="node.className"
    :title="node.title"
    :aria-label="node.title"
  >
    <AppIcon v-if="node.icon" :name="node.icon" />
    <span v-if="node.seal" class="infer-seal" :class="`is-${node.seal}`" aria-hidden="true">
      <AppIcon :name="node.seal === 'true' ? 'check' : 'close'" />
    </span>
    <CondExpr v-for="(child, index) in node.children" :key="index" :part="child" :method="method" />
  </span>
  <button
    v-else
    :class="node.className"
    type="button"
    :title="node.title"
    :role="node.role"
    :data-kind="node.lookup ? node.kind : undefined"
    :data-key="node.lookup ? node.lookup.key : undefined"
    :aria-label="node.title"
    @click="onLookup"
    @keydown.enter.prevent="onLookup"
    @keydown.space.prevent="onLookup"
  >
    <AppIcon v-if="node.icon" :name="node.icon" />
    <span v-if="node.seal" class="infer-seal" :class="`is-${node.seal}`" aria-hidden="true">
      <AppIcon :name="node.seal === 'true' ? 'check' : 'close'" />
    </span>
    <CondExpr v-for="(child, index) in node.children" :key="index" :part="child" :method="method" />
  </button>
</template>
