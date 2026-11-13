<script setup lang="ts">
defineProps<{ items: { id: string; chapter: string; first: string }[] }>();

const emit = defineEmits<{ pick: [id: string] }>();
</script>

<template>
  <div
    v-for="item in items"
    :key="item.id"
    class="lookup-item row row-tall"
    @click="emit('pick', item.id)"
  >
    <div class="li-top">
      <span class="li-id">{{ item.id }}</span>
      <span class="li-ch">{{ item.chapter }}</span>
    </div>
    <span v-if="item.first" class="li-text">{{ item.first }}</span>
  </div>
</template>
