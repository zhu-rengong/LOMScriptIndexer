import { checkpoints } from "../data/checkpoints";
import { graph } from "../data/graph";
import { missions } from "../data/missions";
import { names } from "../data/names";
import { chapterTitle, t } from "../i18n";
import { firstSayTextOf, speakerName } from "../lib/blocks";
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

  const open = computed(() => popovers.isOpen("lookup"));
  const payload = computed(() => popovers.payload("lookup"));
  const kind = computed(() => payload.value.kind || "");
  const key = computed(() => payload.value.key || "");
  const method = computed(() => payload.value.method || "");

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

  const flagWriters = computed(() => flagNodeGroups.value?.writers ?? []);
  const flagCheckers = computed(() => flagNodeGroups.value?.checkers ?? []);

  const close = (): void => {
    popovers.close("lookup");
  };

  const pick = (node: GraphNode): void => {
    const target = { kind: kind.value, key: key.value };
    const name = displayName.value;
    panels.focusText(node.id, name, target);
    store.select(node.id);
  };

  const pickById = (id: string): void => {
    const node = graph.nodeById.get(id);
    if (node) pick(node);
  };

  let loadToken = 0;

  const loadCheckpoint = async (): Promise<void> => {
    const token = ++loadToken;
    checkpoint.value = null;
    if (kind.value !== "check" || !key.value) {
      loading.value = false;
      return;
    }
    const requested = key.value;
    loading.value = true;
    await checkpoints.ensure(requested);
    if (token !== loadToken) return;
    loading.value = false;
    checkpoint.value = checkpoints.getByKey(requested, method.value);
  };

  watch(
    [open, kind, key, method],
    () => {
      if (!open.value) {
        loadToken++;
        checkpoint.value = null;
        loading.value = false;
        return;
      }
      void loadCheckpoint();
    },
    { immediate: true },
  );

  onMounted(() => {
    popovers.register("lookup", {
      id: UI_IDS.lookupPanel,
      group: "pop",
      placement: { align: "start", width: 380 },
    });
  });

  return {
    open,
    kind,
    key,
    method,
    checkpoint,
    loading,
    title,
    subText,
    readsEmptyText,
    rowOf,
    mainNodes: matchedNodes,
    readerNodes: checkpointReaders,
    flagWriters,
    flagCheckers,
    close,
    pick,
    pickById,
  };
};
