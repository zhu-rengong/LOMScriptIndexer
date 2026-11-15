<script setup lang="ts">
import { languages, t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import { UI_IDS } from "../../ui/ids";
import { useScriptStore } from "../../stores/script";
import { useViewStore } from "../../stores/view";

const store = useScriptStore();
const view = useViewStore();

const items = computed(() => languages());

const open = computed(() => overlay.isOpen("langMenu"));

const pick = (id: string) => {
  overlay.close("langMenu");
  void view.switchLang(id);
};

onMounted(() => {
  overlay.register("langMenu", {
    id: "langMenu",
    triggerId: UI_IDS.langBtn,
    group: "menu",
    placement: { align: "end", width: 240, fit: true },
  });
});
</script>

<template>
  <div
    id="langMenu"
    class="menu surface popover"
    role="menu"
    :aria-label="t('moreLang')"
    :hidden="!open"
  >
    <div class="menu-head">{{ t("moreLang") }}</div>
    <button
      v-for="item in items"
      :key="item.id"
      class="menu-item row"
      :class="{ 'is-on': item.id === store.lang }"
      type="button"
      role="menuitemradio"
      :aria-checked="item.id === store.lang"
      :lang="item.html"
      :title="item.label"
      @click="pick(item.id)"
    >
      {{ item.native }}
    </button>
    <div class="menu-sep"></div>
    <p class="menu-note">{{ t("langPickerNote") }}</p>
  </div>
</template>
