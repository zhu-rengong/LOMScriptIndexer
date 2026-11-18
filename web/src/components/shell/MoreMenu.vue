<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { exportRunning, exportScripts } from "../../lib/scriptExport";
import { UI_IDS } from "../../ui/ids";

const open = computed(() => overlay.isOpen("moreMenu"));

const openStats = () => {
  overlay.close("moreMenu");
  overlay.open("stats", { trigger: byId(UI_IDS.statsBtn) });
};

const openHelp = () => {
  overlay.close("moreMenu");
  if (overlay.isOpen("help")) overlay.close("help");
  else overlay.open("help", { trigger: byId(UI_IDS.helpBtn) });
};

const openChangelog = () => {
  overlay.close("moreMenu");
  overlay.open("changelog", { trigger: byId(UI_IDS.changelogBtn) });
};

const runExport = () => {
  overlay.close("moreMenu");
  void exportScripts();
};

onMounted(() => {
  overlay.register("moreMenu", {
    id: "moreMenu",
    triggerId: UI_IDS.moreBtn,
    group: "menu",
    placement: { align: "end", width: 268, fit: true },
  });
});
</script>

<template>
  <div id="moreMenu" class="menu surface popover" role="menu" :hidden="!open">
    <button class="menu-item row" type="button" @click="openStats">{{ t("statsBtn") }}</button>
    <button class="menu-item row" type="button" @click="openHelp">{{ t("helpTitle") }}</button>
    <button class="menu-item row" type="button" @click="openChangelog">
      {{ t("changelogTitle") }}
    </button>
    <div class="menu-sep"></div>
    <button
      class="menu-item row"
      type="button"
      :disabled="exportRunning"
      :title="t('exportScriptsTitle')"
      @click="runExport"
    >
      {{ t("exportScripts") }}
    </button>
  </div>
</template>
