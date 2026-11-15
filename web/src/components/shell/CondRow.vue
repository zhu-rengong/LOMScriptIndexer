<script setup lang="ts">
defineProps<{ result: string }>();
</script>

<template>
  <p class="lc-row">
    <span class="lc-cond"><slot /></span>
    <span class="lc-result">{{ result }}</span>
  </p>
</template>
