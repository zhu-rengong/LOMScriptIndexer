import { checkpoints } from "../data/checkpoints";
import { graph } from "../data/graph";
import { missions } from "../data/missions";
import { names } from "../data/names";
import { chapterTitle, t } from "../i18n";
import { firstSayTextOf, speakerName } from "../lib/blocks";
import { byId } from "../lib/browser";
import { popovers } from "../lib/popover";
import type { CheckpointModel } from "../types/condition";
import type { GraphNode } from "../types/graph";
import { UI_IDS } from "../ui/ids";

const LOOKUP_TITLE_KEYS: Record<string, string> = {
  speaker: "lookupSpeaker",
  flag: "lookupFlag",
  check: "lookupCheck",
  rel: "lookupRel",
  stat: "lookupStat",
};

export const useLookupPanel = () => {
  const store = useScriptStore();
  const panels = usePanelsStore();

  const checkpoint = ref<CheckpointModel | null>(null);
  const loading = ref(false);

  const open = computed(() => panels.lookupState.open);
  const kind = computed(() => panels.lookupState.kind);
  const key = computed(() => panels.lookupState.key);
  const method = computed(() => panels.lookupState.method);

  const flagNodeGroups = computed(() =>
    kind.value === "flag" ? graph.flagUsage(key.value) : null,
  );

  const matchedNodes = computed<GraphNode[]>(() => {
    if (!key.value) return [];
    if (flagNodeGroups.value) {
      const seen = new Set<string>();
      const out: GraphNode[] = [];
      for (const node of flagNodeGroups.value.writers.concat(flagNodeGroups.value.checkers)) {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        out.push(node);
      }
      return out;
    }
    if (kind.value === "mission") {
      return missions.missionOfState(key.value)
        ? graph.missionTriggerNodes(key.value)
        : graph.missionEndNodes(key.value);
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

  const displayName = computed(() => {
    if (kind.value === "speaker") return speakerName(key.value);
    if (kind.value === "mission") {
      return missions.missionOfState(key.value)
        ? names.label("missionState", key.value)
        : names.label("mission", key.value);
    }
    return names.label(kind.value, key.value);
  });

  const title = computed(() => {
    if (kind.value === "mission") {
      return missions.missionOfState(key.value)
        ? t("missionPanelTitle", { state: key.value })
        : t("missionTitle", { mission: key.value });
    }
    return t("lookupTitle", { name: displayName.value, n: totalCount.value });
  });

  const readsEmptyText = computed(() =>
    kind.value === "rel" ? "lookupGroupReadsEmptyRel" : "lookupGroupReadsEmptyStat",
  );

  const subText = computed(() =>
    kind.value === "mission" ? "" : t(LOOKUP_TITLE_KEYS[kind.value] || "lookupStat"),
  );

  const rowOf = (node: GraphNode) => ({
    id: node.id,
    chapter: chapterTitle(graph.chapterOf(node)),
    first: firstSayTextOf(node),
  });

  const flagWriters = computed(() => (flagNodeGroups.value?.writers ?? []).map(rowOf));
  const flagCheckers = computed(() => (flagNodeGroups.value?.checkers ?? []).map(rowOf));
  const mainRows = computed(() => matchedNodes.value.map(rowOf));
  const readerRows = computed(() => checkpointReaders.value.map(rowOf));

  const close = () => {
    panels.hideLookup();
    popovers.close("lookup");
  };

  const pick = (node: GraphNode) => {
    const target = { kind: kind.value, key: key.value };
    const name = displayName.value;
    close();
    panels.focusText(node.id, name, target);
    store.select(node.id);
  };

  const pickById = (id: string) => {
    const node = graph.nodeById.get(id);
    if (node) pick(node);
  };

  const positionLookup = () => {
    const panel = byId(UI_IDS.lookupPanel);
    if (!panel || !panels.lookupState.trigger) return;
    popovers.place(panel, panels.lookupState.trigger, { align: "start", width: 380, fit: true });
  };

  let resizeFrame = 0;
  let observedHeight = 0;
  let observer: ResizeObserver | null = null;

  const schedulePlace = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      if (!panels.lookupState.open || panels.lookupState.pinned) return;
      positionLookup();
    });
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
      if (!panels.lookupState.pinned) {
        popovers.open("lookup", { trigger: panels.lookupState.trigger });
        positionLookup();
      }
      void loadCheckpoint();
    },
  );

  watch(
    () => panels.lookupState.open,
    (value) => {
      if (value) return;
      if (popovers.isOpen("lookup")) popovers.close("lookup");
      checkpoint.value = null;
    },
  );

  onMounted(() => {
    popovers.register("lookup", {
      id: UI_IDS.lookupPanel,
      group: "pop",
      placement: { align: "start", width: 380, fit: true },
      onHide: () => panels.hideLookup(),
    });
    const panel = byId(UI_IDS.lookupPanel);
    if (!panel) return;
    observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0;
      const grew = height > observedHeight + 1;
      observedHeight = height;
      if (grew) schedulePlace();
    });
    observer.observe(panel);
  });

  onUnmounted(() => {
    if (observer) observer.disconnect();
    observer = null;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
  });

  return {
    open,
    checkpoint,
    loading,
    title,
    subText,
    readsEmptyText,
    flagWriters,
    flagCheckers,
    mainRows,
    readerRows,
    close,
    pick,
    pickById,
  };
};
