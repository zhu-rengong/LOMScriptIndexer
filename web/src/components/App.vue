<script setup lang="ts">
import { useHashRoute, writeHash } from "../composables/useHashRoute";
import { useLayout } from "../composables/useLayout";
import { useShortcuts } from "../composables/useShortcuts";
import { graph } from "../data/graph";
import { t } from "../i18n";
import { byId } from "../lib/browser";
import { overlay } from "../lib/overlay";
import { lang } from "../lib/lang";
import { UI_IDS } from "../ui/ids";
import { useScriptStore } from "../stores/script";
import { useViewStore } from "../stores/view";
import { useUiStore } from "../stores/ui";

const store = useScriptStore();
const view = useViewStore();
const ui = useUiStore();

useLayout();
useShortcuts({
  back: () => store.back(),
  forward: () => store.forward(),
  bookmark: () => {
    const node = store.selected();
    if (!node) return;
    const on = store.toggleBookmark(node.id);
    ui.toast(t(on ? "bookmarkAdded" : "bookmarkRemoved"));
  },
  jump: () => {
    const button = byId(UI_IDS.navBtn) as HTMLButtonElement | null;
    if (button && !button.disabled) button.click();
  },
  help: () => {
    if (overlay.isOpen("help")) overlay.close("help");
    else overlay.open("help", { trigger: byId(UI_IDS.helpBtn) });
  },
  search: () => {
    const input = byId(UI_IDS.search) as HTMLInputElement | null;
    input?.focus();
  },
  infer: view.toggleInfer,
  reveal: view.toggleReveal,
});

useHashRoute((id) => {
  if (!graph.nodeById.has(id)) {
    ui.toast(t("statusNotFound", { id }));
    return;
  }
  if (store.selectedId !== id) store.select(id, { history: false });
});

watch(
  () => store.selectedId,
  (id) => {
    if (id) writeHash(id);
  },
);

onMounted(() => {
  overlay.register("chapterRail", {
    id: UI_IDS.chapterRail,
    triggerId: UI_IDS.railToggle,
    group: "sheet",
    onHide: view.hideRail,
  });
  lang.applyDocument(store.lang);
});
</script>

<template>
  <AppHeader />

  <main id="main">
    <ChapterRail />
    <div id="railScrim" class="scrim" :hidden="!view.railOpen" @click="view.closeRail"></div>
    <ReaderPane />
  </main>

  <SettingsDrawer />
  <LookupPanel />
  <StatusLayers />
  <HelpPanel />
  <StatsPanel />
  <ChangelogPanel />
</template>
