<script setup lang="ts">
withDefaults(
  defineProps<{
    as?: string;
    density?: "compact" | "default" | "comfortable";
    active?: boolean;
    disabled?: boolean;
  }>(),
  { as: "button", density: "default", active: false, disabled: false },
);
</script>

<template>
  <component
    :is="as"
    class="row"
    :class="{ 'is-active': active }"
    :data-density="density"
    :type="as === 'button' ? 'button' : undefined"
    :disabled="as === 'button' ? disabled : undefined"
    :aria-disabled="as !== 'button' && disabled ? 'true' : undefined"
  >
    <slot />
  </component>
</template>
