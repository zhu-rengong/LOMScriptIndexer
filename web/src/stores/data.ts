import type {
  ChapterRow,
  DataIndex,
  EdgeRow,
  Facets as WireFacets,
  FlagFactsPayload,
  GraphPayload,
  MissionDocument,
  NodeFlags as WireNodeFlags,
  NodeRow,
  ShardInfo,
  VarReadsPayload,
} from "../types/generated";
import type {
  Chapter,
  Dataset,
  Facets,
  GraphEdge,
  GraphMeta,
  GraphNode,
  ScriptFlags,
  Shard,
} from "../types/graph";
import { DATA_SCHEMA } from "../types/contract";
import { DEFAULT_CHAPTER_COLOR } from "../data/chapters";
import {
  GraphSchema,
  MissionSchema,
  assetUrl,
  fetchJson,
  fetchValidated,
  loadIndex,
} from "../data/load";

const EMPTY_FACETS: Facets = {
  speakers: [],
  flags: [],
  checks: [],
  stats: [],
  relations: [],
  endings: [],
  missions: [],
  optionCount: 0,
  lockCount: 0,
  diceCheckCount: 0,
};

const list = <T>(value: T[] | undefined | null): T[] => (Array.isArray(value) ? value : []);

const normalizeFacets = (value: WireFacets | null | undefined): Facets => ({
  speakers: list(value?.speakers),
  flags: list(value?.flags),
  checks: list(value?.checks),
  stats: list(value?.stats),
  relations: list(value?.relations),
  endings: list(value?.endings),
  missions: list(value?.missions),
  optionCount: value?.optionCount ?? 0,
  lockCount: value?.lockCount ?? 0,
  diceCheckCount: value?.diceCheckCount ?? 0,
});

const normalizeFlags = (value: WireNodeFlags | null | undefined): ScriptFlags => ({
  isEmpty: value?.isEmpty === true,
  isSimplifiedOnly: value?.isSimplifiedOnly === true,
  hasNoOutgoing: value?.hasNoOutgoing === true,
  hasNoIncoming: value?.hasNoIncoming === true,
});

const normalizeNode = (node: NodeRow): GraphNode => ({
  id: node.id ?? "",
  chapterIndex: node.chapterIndex ?? 0,
  outDegree: node.outDegree ?? 0,
  inDegree: node.inDegree ?? 0,
  sayCount: node.sayCount ?? 0,
  flags: normalizeFlags(node.flags),
  facets: node.facets ? normalizeFacets(node.facets) : { ...EMPTY_FACETS },
  missionStates: list(node.missionStates),
  missionEnds: list(node.missionEnds),
  time: typeof node.time === "number" ? node.time : null,
});

const normalizeEdge = (edge: EdgeRow): GraphEdge => ({
  index: edge.index ?? 0,
  source: edge.source ?? "",
  target: edge.target ?? "",
  kind: edge.kind ?? "jump",
  label: edge.label ?? "",
});

const normalizeChapter = (chapter: ChapterRow): Chapter => ({
  id: chapter.id ?? "",
  kind: chapter.kind ?? "other",
  number: typeof chapter.number === "number" ? chapter.number : null,
  color: chapter.color || DEFAULT_CHAPTER_COLOR,
  scriptCount: chapter.scriptCount ?? 0,
});

const normalizeShard = (shard: ShardInfo): Shard => ({
  key: shard.key ?? "",
  nodeCount: shard.nodeCount ?? 0,
  bytes: shard.bytes ?? 0,
  chapterIds: list(shard.chapterIds),
});

const buildMeta = (graph: GraphPayload): GraphMeta => {
  const meta = graph.meta ?? {};
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(meta.counts ?? {})) {
    if (typeof value === "number") counts[key] = value;
  }
  return {
    generated: meta.generated ?? "",
    game: meta.game ?? {},
    langs: list(meta.langs),
    defaultLang: meta.defaultLang ?? "",
    sourceLang: meta.sourceLang ?? list(meta.langs)[0] ?? "",
    vocab: meta.vocab ?? {},
    calendar: meta.calendar ?? {},
    counts,
    shards: list(meta.shards).map(normalizeShard),
    systemEntries: list(meta.systemEntries).map((entry) => ({
      id: entry.id ?? "",
      label: entry.label ?? "",
      origin: entry.origin ?? "",
    })),
    shardByNode: meta.shardByNode ?? {},
    checkpointShardByKey: meta.checkpointShardByKey ?? {},
  };
};

export const useDataStore = defineStore("data", () => {
  const dataset = shallowRef<Dataset | null>(null);

  const load = async (): Promise<Dataset> => {
    const index: DataIndex = await loadIndex();
    if (index.schema !== DATA_SCHEMA) {
      throw new Error(
        `unsupported data schema ${index.schema}; expected ${DATA_SCHEMA},` +
          " rebuild the data and hard refresh to clear cached data",
      );
    }
    const [graph, varReads, missions, flagFacts] = await Promise.all([
      fetchValidated<GraphPayload>(assetUrl(index, "graph"), GraphSchema, "graph"),
      fetchJson<VarReadsPayload>(assetUrl(index, "varReads")),
      fetchValidated<MissionDocument>(assetUrl(index, "missions"), MissionSchema, "missions"),
      fetchJson<FlagFactsPayload>(assetUrl(index, "flagFacts")),
    ]);
    const meta = buildMeta(graph);
    const next: Dataset = {
      index,
      schema: index.schema,
      meta,
      vocab: meta.vocab,
      calendar: meta.calendar,
      nodes: list(graph.nodes).map((node) => normalizeNode(node)),
      edges: list(graph.edges).map(normalizeEdge),
      chapters: list(graph.chapters).map(normalizeChapter),
      varReads: {
        flag: varReads.flag ?? {},
        stat: varReads.stat ?? {},
        rel: varReads.rel ?? {},
      },
      missions,
      flagFacts,
      langs: meta.langs,
      systemEntries: meta.systemEntries,
      shardByNode: meta.shardByNode,
      checkpointShardByKey: meta.checkpointShardByKey,
      assetUrl: (name, vars) => assetUrl(index, name, vars),
    };
    dataset.value = next;
    return next;
  };

  const current = (): Dataset => {
    const value = dataset.value;
    if (!value) throw new Error("dataset is not loaded");
    return value;
  };

  return { dataset, load, current };
});
