<script setup lang="ts">
import { useBodyClasses } from "../composables/useBodyClasses";
import { useShortcuts } from "../composables/useShortcuts";
import { t } from "../i18n";
import { byId } from "../lib/dom";
import { popovers } from "../lib/popover";
import { UI_IDS } from "../ui/ids";

const store = useScriptStore();
const view = useViewStore();
const ui = useUiStore();
const fold = useFoldStore();
const history = useHistoryStore();

useBodyClasses();

useShortcuts({
  back: () => history.back(),
  forward: () => history.forward(),
  bookmark: () => {
    const node = store.selected();
    if (!node) return;
    const on = store.toggleBookmark(node.id);
    ui.toast(t(on ? "bookmarkAdded" : "bookmarkRemoved"));
  },
  jump: () => popovers.toggle("navMenu"),
  help: () => popovers.toggle("help", byId(UI_IDS.helpBtn)),
  search: view.openSearch,
  infer: view.toggleInfer,
  reveal: view.toggleReveal,
  fold: () => fold.toggle(),
});

onMounted(() => {
  popovers.register("chapterRail", {
    id: UI_IDS.chapterRail,
    triggerId: UI_IDS.railToggle,
    group: "sheet",
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
  <VersionPanel />
</template>
