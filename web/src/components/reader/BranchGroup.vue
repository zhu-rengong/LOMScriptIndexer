<script setup lang="ts">
import type { BranchView } from "../../types/beats";

const props = defineProps<{ branches: BranchView[]; foldKey: string; blockPath: string }>();

const branchKey = (branch: BranchView, position: number): string =>
  branch.check
    ? `${branch.check.kind}:${branch.check.key}:${branch.check.expectedResult ?? ""}`
    : `pos:${position}`;
</script>

<template>
  <div class="branch-group" :data-block-path="blockPath">
    <BranchBlock
      v-for="(branch, position) in props.branches"
      :key="branchKey(branch, position)"
      :branch="branch"
      :fold-key="`${props.foldKey}/b${position}`"
    />
  </div>
</template>
