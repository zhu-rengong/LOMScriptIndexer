<script setup lang="ts">
const ui = useUiStore();
</script>

<template>
  <div class="status-stack">
    <div id="toast" class="toast" role="status" aria-live="polite" :hidden="!ui.toastText">
      {{ ui.toastText }}
    </div>
    <div id="ioStatus" class="io-status" role="status" aria-live="polite" :hidden="!ui.ioText">
      {{ ui.ioText }}
    </div>
  </div>
</template>
