<script setup lang="ts">
import { checkpoints } from "../../data/checkpoints";
import { graph } from "../../data/graph";
import { missions } from "../../data/missions";
import { names } from "../../data/names";
import { chapterTitle, t } from "../../i18n";
import { firstSayTextOf, speakerName } from "../../lib/blocks";
import { overlay } from "../../lib/overlay";
import type { CheckpointModel } from "../../types/condition";
import type { GraphNode } from "../../types/graph";
import { UI_IDS } from "../../ui/ids";
import CheckpointBranches from "./CheckpointBranches.vue";
import HitList, { type HitRow } from "./HitList.vue";
import MissionStateDetail from "./MissionStateDetail.vue";
import PanelShell from "../ui/PanelShell.vue";
import { useScriptStore } from "../../stores/script";
import { useViewStore } from "../../stores/view";
import { usePanelsStore } from "../../stores/panels";

const store = useScriptStore();
const view = useViewStore();
const panels = usePanelsStore();

const checkpoint = ref<CheckpointModel | null>(null);
const loading = ref(false);

const open = computed(() => panels.lookupState.open);

const kind = computed(() => panels.lookupState.kind);

const key = computed(() => panels.lookupState.key);

const method = computed(() => panels.lookupState.method);

const placement = computed(() =>
  view.layout === "mobile" ? undefined : { align: "start" as const, width: 380, fit: true },
);

const flagNodeGroups = computed(() => (kind.value === "flag" ? graph.flagUsage(key.value) : null));

const matchedNodes = computed<GraphNode[]>(() => {
  if (!key.value) return [];
  if (kind.value === "flag") {
    const usage = graph.flagUsage(key.value);
    const seen = new Set<string>();
    const out: GraphNode[] = [];
    for (const node of usage.writers.concat(usage.checkers)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      out.push(node);
    }
    return out;
  }
  return graph.nodesWithFacet(kind.value, key.value);
});

const checkpointReaders = computed<GraphNode[]>(() => {
  if (!key.value || (kind.value !== "stat" && kind.value !== "rel")) return [];
  return graph.checkpointReaderNodes(kind.value, key.value);
});

const totalCount = computed(() => {
  const seen = new Set(matchedNodes.value.map((node) => node.id));
  for (const node of checkpointReaders.value) seen.add(node.id);
  return seen.size;
});

const displayName = computed(() =>
  kind.value === "speaker" ? speakerName(key.value) : names.label(kind.value, key.value),
);

const missionHit = computed(() =>
  kind.value === "mission" ? missions.missionOfState(key.value) : null,
);

const missionRecord = computed(() =>
  missionHit.value ? missions.recordOf(missionHit.value.mission) : null,
);

const title = computed(() =>
  kind.value === "mission"
    ? t("missionPanelTitle", { state: key.value })
    : t("lookupTitle", {
        name: displayName.value,
        n: totalCount.value,
      }),
);

const readsEmptyText = computed(() =>
  kind.value === "rel" ? "lookupGroupReadsEmptyRel" : "lookupGroupReadsEmptyStat",
);

const lookupTitleKey = computed(() =>
  kind.value === "speaker"
    ? "lookupSpeaker"
    : kind.value === "flag"
      ? "lookupFlag"
      : kind.value === "check"
        ? "lookupCheck"
        : kind.value === "rel"
          ? "lookupRel"
          : "lookupStat",
);

const subText = computed(() => (kind.value === "mission" ? "" : t(lookupTitleKey.value)));

const rowOf = (node: GraphNode): HitRow => ({
  id: node.id,
  chapter: chapterTitle(graph.chapterOf(node)),
  snippet: firstSayTextOf(node),
});

const flagWriters = computed(() => (flagNodeGroups.value?.writers ?? []).map(rowOf));

const flagCheckers = computed(() => (flagNodeGroups.value?.checkers ?? []).map(rowOf));

const mainRows = computed(() => matchedNodes.value.map(rowOf));

const readerRows = computed(() => checkpointReaders.value.map(rowOf));

const close = () => {
  panels.hideLookup();
  overlay.close("lookup");
};

const pickById = (id: string) => {
  const node = graph.nodeById.get(id);
  if (!node) return;
  const target = { kind: kind.value, key: key.value };
  const name = displayName.value;
  close();
  panels.focusText(node.id, name, target);
  store.select(node.id, { history: true });
};

const loadCheckpoint = async () => {
  checkpoint.value = null;
  if (kind.value !== "check" || !key.value) return;
  loading.value = true;
  await checkpoints.ensure(key.value);
  if (kind.value !== "check" || key.value !== panels.lookupState.key) return;
  loading.value = false;
  checkpoint.value = checkpoints.getByKey(key.value, method.value);
};

watch(
  () => panels.lookupState.requestSeq,
  async () => {
    if (!panels.lookupState.open) return;
    await nextTick();
    if (panels.lookupState.pinned) {
      void loadCheckpoint();
      return;
    }
    overlay.open("lookup", { trigger: panels.lookupState.trigger });
    void loadCheckpoint();
  },
);

watch(
  () => panels.lookupState.open,
  (value) => {
    if (value) return;
    if (overlay.isOpen("lookup")) overlay.close("lookup");
    checkpoint.value = null;
  },
);
</script>

<template>
  <PanelShell
    :id="UI_IDS.lookupPanel"
    overlay-key="lookup"
    kind="popover"
    pad="tight"
    :title="title"
    heading-id="lookupTitle"
    :close-title="t('closeTitle')"
    :placement="placement"
    group="pop"
    @hide="panels.hideLookup()"
  >
    <template v-if="subText" #sub>
      <p id="lookupSub" class="lookup-sub">{{ subText }}</p>
    </template>

    <MissionStateDetail
      v-if="kind === 'mission' && missionHit"
      :mission-id="missionHit.mission"
      :state-key="key"
      :state="missionHit.state"
      :record="missionRecord"
    />
    <template v-else>
      <CheckpointBranches
        v-if="kind === 'check' && checkpoint"
        :checkpoint="checkpoint"
        :method="method"
      />
      <div v-else-if="kind === 'check' && loading" class="lookup-cond">
        <p class="lookup-cond-title">{{ t("lookupCondTitle") }}</p>
        <div class="lookup-cond-body">
          <p class="lookup-cond-muted">{{ t("lookupCondLoading") }}</p>
        </div>
      </div>

      <p v-if="!totalCount" class="empty">{{ t("lookupEmpty") }}</p>

      <template v-else-if="flagNodeGroups">
        <template v-if="flagNodeGroups.writers.length">
          <p class="lookup-group">
            {{ t("lookupGroupWrites", { n: flagNodeGroups.writers.length }) }}
          </p>
          <HitList :rows="flagWriters" @pick="pickById" />
        </template>
        <template v-if="flagNodeGroups.checkers.length">
          <p class="lookup-group">
            {{ t("lookupGroupReads", { n: flagNodeGroups.checkers.length }) }}
          </p>
          <HitList :rows="flagCheckers" @pick="pickById" />
        </template>
        <p v-else class="lookup-group-note">{{ t("lookupGroupReadsEmpty") }}</p>
      </template>

      <template v-else>
        <HitList :rows="mainRows" @pick="pickById" />
        <template v-if="checkpointReaders.length">
          <p class="lookup-group">
            {{ t("lookupGroupReads", { n: checkpointReaders.length }) }}
          </p>
          <HitList :rows="readerRows" @pick="pickById" />
        </template>
        <p v-else-if="kind === 'stat' || kind === 'rel'" class="lookup-group-note">
          {{ t(readsEmptyText) }}
        </p>
      </template>
    </template>

    <template #hint>{{ t("lookupHint") }}</template>
  </PanelShell>
</template>
