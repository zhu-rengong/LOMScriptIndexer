<script setup lang="ts">
defineProps<{ lines: string[] }>();
</script>

<template>
  <div class="lore">
    <div class="lore-text">
      <p v-for="(line, index) in lines" :key="index" class="lore-p">{{ line }}</p>
    </div>
  </div>
</template>
