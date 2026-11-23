<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/dom";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const open = computed(() => popovers.isOpen(UI_IDS.moreMenu));
const exporting = ref(false);

const openStats = () => {
  popovers.open("stats", { trigger: byId(UI_IDS.statsBtn) });
};

const openHelp = () => {
  popovers.open("help", { trigger: byId(UI_IDS.helpBtn) });
};

const openChangelog = () => {
  popovers.open("changelog", { trigger: byId(UI_IDS.changelogBtn) });
};

const openVersion = () => {
  popovers.open("version", { trigger: byId(UI_IDS.moreBtn) });
};

const runExport = async (): Promise<void> => {
  popovers.close(UI_IDS.moreMenu);
  if (exporting.value) return;
  exporting.value = true;
  try {
    const module = await import("../../lib/export/download");
    await module.exportScripts();
  } catch (error) {
    console.error("[ScriptIndexer] script export module failed to load", error);
    useUiStore(pinia).toast(t("exportFailed"));
  } finally {
    exporting.value = false;
  }
};

onMounted(() => {
  popovers.register(UI_IDS.moreMenu, {
    id: UI_IDS.moreMenu,
    triggerId: UI_IDS.moreBtn,
    group: "menu",
    placement: { align: "end", width: 268 },
  });
});
</script>

<template>
  <div :id="UI_IDS.moreMenu" class="menu surface popover" role="menu" :hidden="!open">
    <button class="menu-item row" type="button" @click="openStats">{{ t("statsBtn") }}</button>
    <button class="menu-item row" type="button" @click="openHelp">{{ t("helpTitle") }}</button>
    <button class="menu-item row" type="button" @click="openChangelog">
      {{ t("changelogTitle") }}
    </button>
    <button class="menu-item row" type="button" @click="openVersion">
      {{ t("versionTitle") }}
    </button>
    <div class="menu-sep menu-narrow"></div>
    <a
      class="menu-item row menu-narrow"
      href="https://github.com/zhu-rengong/LOMScriptIndexer"
      target="_blank"
      rel="noopener noreferrer"
      :title="t('githubBtnTitle')"
    >
      GitHub
    </a>
    <a
      class="menu-item row menu-narrow"
      href="https://wbapp-xx74txuyeotgchq6dlrweb.app.workbuddy.host/?sharecode=BZQLRCGPP5"
      target="_blank"
      rel="noopener noreferrer"
      :title="t('workbuddyBtnTitle')"
    >
      WorkBuddy
    </a>
    <div class="menu-sep"></div>
    <button
      class="menu-item row"
      type="button"
      :disabled="exporting"
      :title="t('exportScriptsTitle')"
      @click="runExport"
    >
      {{ t("exportScripts") }}
    </button>
  </div>
</template>
