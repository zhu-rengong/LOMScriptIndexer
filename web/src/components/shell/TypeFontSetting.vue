<script setup lang="ts">
import { t } from "../../i18n";
import { popovers } from "../../lib/popover";
import type { FontTarget } from "../../types/font";
import { useFontSetting } from "../../composables/useFontSetting";

const props = defineProps<{ target: FontTarget; label?: string }>();

const view = useViewStore();
const { label } = useFontSetting(() => props.target);

const trigger = ref<HTMLButtonElement | null>(null);

const caption = computed(() => props.label || t("typeFont"));

const pickerOpen = computed(() => popovers.isOpen("fontPicker"));

const togglePicker = () => {
  if (popovers.isOpen("fontPicker")) {
    popovers.close("fontPicker");
    return;
  }
  view.setPickerTarget(props.target);
  popovers.open("fontPicker", { trigger: trigger.value });
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
