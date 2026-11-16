<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { fonts } from "../../lib/systemFonts";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useFontSetting } from "../../composables/useFontSetting";

const props = defineProps<{ target: FontTarget }>();

const { label } = useFontSetting(() => props.target);

const pickerOpen = computed(() => overlay.isOpen("fontPicker"));

const togglePicker = () => {
  if (overlay.isOpen("fontPicker")) {
    overlay.close("fontPicker");
    return;
  }
  void fonts.ensureFamilies();
  overlay.open("fontPicker", {
    trigger: byId(UI_IDS.typeFontTrigger),
    keep: ["settings"],
    placement: { align: "start", gap: 6, width: 300, fit: true },
  });
};
</script>

<template>
  <p class="sub-label">{{ t("typeFont") }}</p>
  <button
    :id="UI_IDS.typeFontTrigger"
    class="btn select font-trigger settings-select"
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
