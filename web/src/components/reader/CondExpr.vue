<script setup lang="ts">
import { condParts } from "../../lib/conditions";
import type { ConditionNode } from "../../types/condition";
import CondPartView from "./CondPartView.vue";

const props = defineProps<{ expr?: ConditionNode | null; method?: string }>();

const part = computed(() => condParts(props.expr || null));
</script>

<template>
  <CondPartView :part="part" :method="props.method" />
</template>
