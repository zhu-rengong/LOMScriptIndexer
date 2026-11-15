<script setup lang="ts">
import { graph } from "../../data/graph";
import { chapterTitle, languages, t } from "../../i18n";
import { edgeLabelOf } from "../../lib/blocks";
import { openInfo } from "../../lib/info";
import type { MenuGroup } from "../../lib/menus";
import { overlay } from "../../lib/overlay";
import { stripMarkup } from "../../lib/richText";
import type { ReaderVisibleKind } from "../../types/beats";
import type { GraphEdge } from "../../types/graph";
import { UI_IDS } from "../../ui/ids";
import MenuPanel from "../ui/MenuPanel.vue";
import type { InfoTab } from "../../stores/ui";
import { useScriptStore } from "../../stores/script";
import { useViewStore } from "../../stores/view";

const store = useScriptStore();
const view = useViewStore();

const KINDS: { kind: ReaderVisibleKind; labelKey: string }[] = [
  { kind: "dialog", labelKey: "typeDialog" },
  { kind: "think", labelKey: "typeThink" },
  { kind: "narration", labelKey: "typeNarration" },
  { kind: "lore", labelKey: "typeLore" },
];

const INFO_TRIGGERS: Record<string, string> = {
  stats: UI_IDS.statsBtn,
  help: UI_IDS.helpBtn,
  changelog: UI_IDS.changelogBtn,
};

const langGroups = computed<MenuGroup[]>(() => [
  {
    label: t("moreLang"),
    entries: languages().map((item) => ({
      id: item.id,
      label: item.native,
      title: item.label,
      checked: item.id === store.lang,
    })),
  },
]);

const nextTargets = computed(() => {
  const current = store.selected();
  if (!current) return [];
  return graph
    .nextTargets(current)
    .slice(0, 6)
    .map((item) => {
      const label = stripMarkup(edgeLabelOf(item.edge)) || chapterTitle(graph.chapterOf(item.node));
      return { id: item.node.id, label };
    });
});

const moreGroups = computed<MenuGroup[]>(() => {
  const groups: MenuGroup[] = [
    {
      entries: [
        { id: "info:stats", label: t("statsBtn") },
        { id: "info:help", label: t("helpTitle") },
        { id: "info:changelog", label: t("changelogTitle") },
      ],
    },
  ];
  if (nextTargets.value.length) {
    groups.push({
      label: t("recentChoices"),
      entries: nextTargets.value.map((item) => ({
        id: `go:${item.id}`,
        label: item.id,
        meta: item.label,
        emphasis: true,
      })),
    });
  }
  return groups;
});

const outgoing = computed(() => {
  const current = store.selected();
  if (!current) return [];
  const index = graph.indexById.get(current.id) ?? -1;
  if (index < 0) return [];
  return (graph.outgoingByIndex[index] || [])
    .map((edge) => ({ edge, target: graph.nodeById.get(edge.target) || null }))
    .filter((item) => !!item.target);
});

const incoming = computed(() => {
  const current = store.selected();
  if (!current) return [];
  const index = graph.indexById.get(current.id) ?? -1;
  if (index < 0) return [];
  return (graph.incomingByIndex[index] || [])
    .map((edge) => ({ edge, target: graph.nodeById.get(edge.source) || null }))
    .filter((item) => !!item.target);
});

const edgeLabelText = (edge: GraphEdge) => stripMarkup(edgeLabelOf(edge)) || "";

const edgeBadge = (edge: GraphEdge) =>
  edge.kind === "temp" || edge.kind === "travel" ? t("navTemp") : "";

const navGroups = computed<MenuGroup[]>(() => [
  {
    label: t("navOut", { n: outgoing.value.length }),
    empty: t("navEmpty"),
    entries: outgoing.value.map((item) => ({
      id: item.target?.id || "",
      label: item.target?.id || "",
      meta: edgeLabelText(item.edge),
      badge: edgeBadge(item.edge),
      emphasis: true,
    })),
  },
  {
    label: t("navIn", { n: incoming.value.length }),
    empty: t("navEmpty"),
    entries: incoming.value.map((item) => ({
      id: item.target?.id || "",
      label: item.target?.id || "",
      meta: edgeLabelText(item.edge),
      badge: edgeBadge(item.edge),
      emphasis: true,
    })),
  },
]);

const filterGroups = computed<MenuGroup[]>(() => [
  {
    label: t("displayFilterHead"),
    entries: KINDS.map((item) => ({
      id: item.kind,
      label: t(item.labelKey),
      check: true,
      checked: view.visibleKinds[item.kind],
    })),
  },
]);

const pickLang = (id: string) => {
  overlay.close("langMenu");
  void view.switchLang(id);
};

const pickMore = (id: string) => {
  overlay.close("moreMenu");
  if (id.startsWith("info:")) {
    const tab = id.slice(5) as InfoTab;
    openInfo(tab, INFO_TRIGGERS[tab] || UI_IDS.statsBtn);
    return;
  }
  if (id.startsWith("go:")) store.select(id.slice(3), { history: true });
};

const pickNode = (id: string) => {
  overlay.close("navMenu");
  if (id) store.select(id, { history: true });
};

const toggleKind = (id: string) => {
  view.toggleKind(id as ReaderVisibleKind);
};
</script>

<template>
  <MenuPanel
    id="langMenu"
    overlay-key="langMenu"
    :groups="langGroups"
    :trigger-id="UI_IDS.langBtn"
    :placement="{ align: 'end', width: 240, fit: true }"
    :label="t('moreLang')"
    :note="t('langPickerNote')"
    @pick="pickLang"
  />

  <MenuPanel
    id="moreMenu"
    overlay-key="moreMenu"
    :groups="moreGroups"
    :trigger-id="UI_IDS.moreBtn"
    :placement="{ align: 'end', width: 268, fit: true }"
    @pick="pickMore"
  />

  <MenuPanel
    id="navMenu"
    overlay-key="navMenu"
    :groups="navGroups"
    :trigger-id="UI_IDS.navBtn"
    wide
    :placement="{ align: 'end', width: 340, fit: true }"
    :label="t('navBtnTitle')"
    @pick="pickNode"
  />

  <MenuPanel
    :id="UI_IDS.displayFilterMenu"
    overlay-key="displayFilter"
    :groups="filterGroups"
    :trigger-id="UI_IDS.displayFilterBtn"
    :placement="{ align: 'end', width: 200, fit: true }"
    :label="t('displayFilterTitle')"
    @toggle="toggleKind"
  />
</template>
