<script setup lang="ts">
defineProps<{ lines: string[]; blockPath: string }>();
</script>

<template>
  <div class="lore" :data-block-path="blockPath">
    <div class="lore-text">
      <p v-for="(line, index) in lines" :key="index" class="lore-p">{{ line }}</p>
    </div>
  </div>
</template>
