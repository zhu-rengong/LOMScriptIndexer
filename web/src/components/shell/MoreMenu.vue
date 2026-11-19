<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
import { exportRunning, exportScripts } from "../../lib/export/download";
import { UI_IDS } from "../../ui/ids";

const open = computed(() => popovers.isOpen("moreMenu"));

const openStats = () => {
  popovers.close("moreMenu");
  popovers.open("stats", { trigger: byId(UI_IDS.statsBtn) });
};

const openHelp = () => {
  popovers.close("moreMenu");
  if (popovers.isOpen("help")) popovers.close("help");
  else popovers.open("help", { trigger: byId(UI_IDS.helpBtn) });
};

const openChangelog = () => {
  popovers.close("moreMenu");
  popovers.open("changelog", { trigger: byId(UI_IDS.changelogBtn) });
};

const runExport = () => {
  popovers.close("moreMenu");
  void exportScripts();
};

onMounted(() => {
  popovers.register("moreMenu", {
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
