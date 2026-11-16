<script setup lang="ts">
import { t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import type { FontTarget } from "../../types/font";
import AppIcon from "../ui/AppIcon.vue";
import { useFontSetting } from "../../composables/useFontSetting";
import { useViewStore } from "../../stores/view";

const props = defineProps<{ target: FontTarget; label?: string }>();

const view = useViewStore();
const { label } = useFontSetting(() => props.target);

const trigger = ref<HTMLButtonElement | null>(null);

const caption = computed(() => props.label || t("typeFont"));

const pickerOpen = computed(() => overlay.isOpen("fontPicker"));

const togglePicker = () => {
  if (overlay.isOpen("fontPicker")) {
    overlay.close("fontPicker");
    return;
  }
  view.setPickerTarget(props.target);
  overlay.open("fontPicker", { trigger: trigger.value });
};
</script>

<template>
  <p class="sub-label">{{ caption }}</p>
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
