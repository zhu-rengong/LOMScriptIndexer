<script setup lang="ts">
import { t } from "../../i18n";
import { useUiStore } from "../../stores/ui";

const ui = useUiStore();

const toastText = computed(() => (ui.toastKey ? t(ui.toastKey, ui.toastVars) : ""));

const ioText = computed(() => (ui.ioKey ? t(ui.ioKey, ui.ioVars) : ""));
</script>

<template>
  <div id="toast" class="status-float toast" role="status" aria-live="polite" :hidden="!toastText">
    {{ toastText }}
  </div>
  <div
    id="ioStatus"
    class="status-float io-status"
    role="status"
    aria-live="polite"
    :hidden="!ioText"
  >
    {{ ioText }}
  </div>
</template>
