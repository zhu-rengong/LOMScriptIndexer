<script setup lang="ts">
defineProps<{ items: { id: string; chapter: string; first: string }[] }>();

const emit = defineEmits<{ pick: [id: string] }>();
</script>

<template>
  <div
    v-for="item in items"
    :key="item.id"
    class="row row-tall result"
    @click="emit('pick', item.id)"
  >
    <span class="result-id">{{ item.id }}</span>
    <span class="result-meta">{{ item.chapter }}</span>
    <span v-if="item.first" class="result-text is-lookup">{{ item.first }}</span>
  </div>
</template>
