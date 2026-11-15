<script setup lang="ts">
import { useUiStore } from "../../stores/ui";

const ui = useUiStore();
</script>

<template>
  <div id="toast" class="toast" role="status" aria-live="polite" :hidden="!ui.toastText">
    {{ ui.toastText }}
  </div>
  <div id="ioStatus" class="io-status" role="status" aria-live="polite" :hidden="!ui.ioText">
    {{ ui.ioText }}
  </div>
</template>
