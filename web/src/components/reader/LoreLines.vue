<script setup lang="ts">
import RichText from "./RichText.vue";

defineProps<{ text: string }>();
</script>

<template>
  <div class="lore">
    <div class="lore-text"><RichText :text="text" hard-breaks /></div>
  </div>
</template>
