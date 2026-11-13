<script setup lang="ts">
defineProps<{
  id?: string;
  label: string;
  value: number;
  text: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{ update: [value: number] }>();
</script>

<template>
  <div class="field-row sub-row" :hidden="disabled">
    <label class="sub-label" :for="id">{{ label }}</label>
    <output class="field-value">{{ text }}</output>
  </div>
  <input
    :id="id"
    class="range"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="value"
    :hidden="disabled"
    :aria-label="label"
    @input="emit('update', Number(($event.target as HTMLInputElement).value))"
  />
</template>
