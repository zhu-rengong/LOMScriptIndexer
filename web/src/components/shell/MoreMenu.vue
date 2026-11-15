<script setup lang="ts">
import { graph } from "../../data/graph";
import { chapterTitle, t } from "../../i18n";
import { edgeLabelOf } from "../../lib/blocks";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { stripMarkup } from "../../lib/richText";
import { UI_IDS } from "../../ui/ids";
import { useScriptStore } from "../../stores/script";

const store = useScriptStore();

const open = computed(() => overlay.isOpen("moreMenu"));

const selectedScript = computed(() => store.selected());

const nextJumpTargets = computed(() => {
  const current = selectedScript.value;
  if (!current) return [];
  return graph
    .nextTargets(current)
    .slice(0, 6)
    .map((item) => {
      const label = stripMarkup(edgeLabelOf(item.edge)) || chapterTitle(graph.chapterOf(item.node));
      return { id: item.node.id, label };
    });
});

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

const pick = (id: string) => {
  overlay.close("moreMenu");
  store.select(id, { history: true });
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
    <template v-if="nextJumpTargets.length">
      <div class="menu-sep"></div>
      <div class="menu-head">{{ t("recentChoices") }}</div>
      <button
        v-for="item in nextJumpTargets"
        :key="item.id"
        class="nav-item row"
        type="button"
        role="menuitem"
        @click="pick(item.id)"
      >
        <span class="nav-id">{{ item.id }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </button>
    </template>
  </div>
</template>
