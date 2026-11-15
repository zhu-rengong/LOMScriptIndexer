<script setup lang="ts">
import { graph } from "../../data/graph";
import { t } from "../../i18n";
import { edgeLabelOf } from "../../lib/blocks";
import { overlay } from "../../lib/overlay";
import { stripMarkup } from "../../lib/richText";
import type { GraphEdge } from "../../types/graph";
import { UI_IDS } from "../../ui/ids";
import { useScriptStore } from "../../stores/script";

const store = useScriptStore();

const open = computed(() => overlay.isOpen("navMenu"));

const node = computed(() => store.selected());

const nodeIndex = computed(() => (node.value ? (graph.indexById.get(node.value.id) ?? -1) : -1));

const outgoing = computed(() => {
  if (nodeIndex.value < 0) return [];
  return (graph.outgoingByIndex[nodeIndex.value] || [])
    .map((edge) => ({
      edge,
      target: graph.nodeById.get(edge.target) || null,
    }))
    .filter((item) => !!item.target);
});

const incoming = computed(() => {
  if (nodeIndex.value < 0) return [];
  return (graph.incomingByIndex[nodeIndex.value] || [])
    .map((edge) => ({
      edge,
      target: graph.nodeById.get(edge.source) || null,
    }))
    .filter((item) => !!item.target);
});

const edgeLabelText = (edge: GraphEdge) => stripMarkup(edgeLabelOf(edge)) || "";

const edgeGroupLabel = (edge: GraphEdge) => {
  if (edge.kind === "temp" || edge.kind === "travel") return t("navTemp");
  return "";
};

const pick = (id: string) => {
  overlay.close("navMenu");
  store.select(id, { history: true });
};

onMounted(() => {
  overlay.register("navMenu", {
    id: "navMenu",
    triggerId: UI_IDS.navBtn,
    group: "menu",
    placement: { align: "end", width: 340, fit: true },
  });
});
</script>

<template>
  <div id="navMenu" class="menu menu-wide surface popover" role="menu" :hidden="!open">
    <div class="menu-list popover-list">
      <div class="menu-head">{{ t("navOut", { n: outgoing.length }) }}</div>
      <template v-if="outgoing.length">
        <button
          v-for="item in outgoing"
          :key="`${item.edge.index}-out`"
          class="nav-item row"
          type="button"
          role="menuitem"
          @click="pick(item.target?.id || '')"
        >
          <span class="nav-id">{{ item.target?.id }}</span>
          <span v-if="edgeLabelText(item.edge)" class="nav-label">
            {{ edgeLabelText(item.edge) }}
          </span>
          <span v-if="edgeGroupLabel(item.edge)" class="nav-badge badge">
            {{ edgeGroupLabel(item.edge) }}
          </span>
        </button>
      </template>
      <div v-else class="menu-empty popover-empty">{{ t("navEmpty") }}</div>

      <div class="menu-sep"></div>

      <div class="menu-head">{{ t("navIn", { n: incoming.length }) }}</div>
      <template v-if="incoming.length">
        <button
          v-for="item in incoming"
          :key="`${item.edge.index}-in`"
          class="nav-item row"
          type="button"
          role="menuitem"
          @click="pick(item.target?.id || '')"
        >
          <span class="nav-id">{{ item.target?.id }}</span>
          <span v-if="edgeLabelText(item.edge)" class="nav-label">
            {{ edgeLabelText(item.edge) }}
          </span>
          <span v-if="edgeGroupLabel(item.edge)" class="nav-badge badge">
            {{ edgeGroupLabel(item.edge) }}
          </span>
        </button>
      </template>
      <div v-else class="menu-empty popover-empty">{{ t("navEmpty") }}</div>
    </div>
  </div>
</template>
