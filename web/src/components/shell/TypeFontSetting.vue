<script setup lang="ts">
import { t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import type { FontTarget } from "../../types/font";
import AppIcon from "../ui/AppIcon.vue";
import { useFontSetting } from "../../composables/useFontSetting";

const props = defineProps<{ target: FontTarget }>();

const { label } = useFontSetting(() => props.target);

const trigger = ref<HTMLButtonElement | null>(null);

const pickerOpen = computed(() => overlay.isOpen("fontPicker"));

const togglePicker = () => {
  if (overlay.isOpen("fontPicker")) {
    overlay.close("fontPicker");
    return;
  }
  overlay.open("fontPicker", { trigger: trigger.value });
};
</script>

<template>
  <p class="sub-label">{{ t("typeFont") }}</p>
  <button
    ref="trigger"
    class="btn select settings-select"
    type="button"
    aria-haspopup="listbox"
    aria-controls="fontPicker"
    :aria-expanded="pickerOpen"
    @click="togglePicker"
  >
    <span class="ft-name">{{ label }}</span>
    <AppIcon name="chevron" class="caret" />
  </button>
</template>
