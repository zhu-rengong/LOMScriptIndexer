<script setup lang="ts">
import { useLayout } from "../composables/useLayout";
import { useShortcuts } from "../composables/useShortcuts";
import { t } from "../i18n";
import { byId } from "../lib/browser";
import { popovers } from "../lib/popover";
import { useFoldStore } from "../stores/fold";
import { useScriptStore } from "../stores/script";
import { useViewStore } from "../stores/view";
import { useUiStore } from "../stores/ui";
import { UI_IDS } from "../ui/ids";

const store = useScriptStore();
const view = useViewStore();
const ui = useUiStore();
const fold = useFoldStore();

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
  help: () => popovers.toggle("help", byId(UI_IDS.helpBtn)),
  search: () => {
    const input = byId(UI_IDS.search) as HTMLInputElement | null;
    input?.focus();
  },
  infer: view.toggleInfer,
  condInfer: view.toggleCondInfer,
  reveal: view.toggleReveal,
  fold: () => fold.toggle(),
});

onMounted(() => {
  popovers.register("chapterRail", {
    id: UI_IDS.chapterRail,
    triggerId: UI_IDS.railToggle,
    group: "sheet",
    onHide: view.hideRail,
  });
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
