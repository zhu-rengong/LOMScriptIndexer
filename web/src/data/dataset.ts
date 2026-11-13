import { DATA_SCHEMA } from "../types/contract";
import type {
  CalendarInfo,
  CheckpointDocument,
  DataIndex,
  Facets as WireFacets,
  FlagFactsPayload,
  GraphPayload,
  MissionDocument,
  NodeFlags as WireNodeFlags,
  NodeRow,
  VarReadsPayload,
} from "../types/generated";
import type {
  Chapter,
  Dataset,
  Facets,
  GameInfo,
  GraphEdge,
  GraphMeta,
  GraphNode,
  ScriptFlags,
  Shard,
  Vocab,
} from "../types/graph";
import { assetUrl, fetchJson, loadIndex } from "./load";

const DEFAULT_CHAPTER_COLOR = "#8A8578";

export const EMPTY_CHAPTER: Chapter = {
  id: "",
  kind: "other",
  number: null,
  color: DEFAULT_CHAPTER_COLOR,
  scriptCount: 0,
};

const EMPTY_FACETS: Facets = {
  speakers: [],
  flags: [],
  checks: [],
  stats: [],
  relations: [],
  endings: [],
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
  time: typeof node.time === "number" ? node.time : null,
});

const normalizeEdge = (edge: GraphEdge): GraphEdge => ({
  index: edge.index ?? 0,
  source: edge.source ?? "",
  target: edge.target ?? "",
  kind: edge.kind ?? "jump",
  label: edge.label ?? "",
});

const normalizeChapter = (chapter: Chapter): Chapter => ({
  id: chapter.id ?? "",
  kind: chapter.kind ?? "other",
  number: typeof chapter.number === "number" ? chapter.number : null,
  color: chapter.color || DEFAULT_CHAPTER_COLOR,
  scriptCount: chapter.scriptCount ?? 0,
});

const normalizeShard = (shard: Shard): Shard => ({
  key: shard.key ?? "",
  nodeCount: shard.nodeCount ?? 0,
  bytes: shard.bytes ?? 0,
  chapterIds: list(shard.chapterIds),
});

const buildMeta = (graph: GraphPayload): GraphMeta => {
  const meta = graph.meta ?? {};
  const shards = list(meta.shards).map((shard) => normalizeShard(shard as Shard));
  return {
    generated: meta.generated ?? "",
    game: (meta.game ?? {}) as GameInfo,
    langs: list(meta.langs),
    defaultLang: meta.defaultLang ?? "",
    sourceLang: meta.sourceLang ?? list(meta.langs)[0] ?? "",
    vocab: (meta.vocab ?? {}) as Vocab,
    calendar: (meta.calendar ?? {}) as CalendarInfo,
    counts: (meta.counts ?? {}) as unknown as Record<string, number>,
    shards,
    systemEntries: list(meta.systemEntries).map((entry) => ({
      id: entry.id ?? "",
      label: entry.label ?? "",
      origin: entry.origin ?? "",
    })),
    shardByNode: meta.shardByNode ?? {},
    checkpointShardByKey: meta.checkpointShardByKey ?? {},
  };
};

export let dataset = undefined as unknown as Dataset;

export const loadDataset = async (): Promise<Dataset> => {
  const index: DataIndex = await loadIndex();
  if (index.schema !== DATA_SCHEMA) {
    throw new Error(
      `unsupported data schema ${index.schema}; expected ${DATA_SCHEMA},` +
        " rebuild the data and hard refresh to clear cached data",
    );
  }
  const [graph, varReads, missions, flagFacts] = await Promise.all([
    fetchJson<GraphPayload>(assetUrl(index, "graph")),
    fetchJson<VarReadsPayload>(assetUrl(index, "varReads")),
    fetchJson<MissionDocument>(assetUrl(index, "missions")),
    fetchJson<FlagFactsPayload>(assetUrl(index, "flagFacts")),
  ]);
  const meta = buildMeta(graph);
  const emptyCheckpoints: CheckpointDocument = { schema: "", items: {} };
  dataset = {
    index,
    schema: index.schema,
    meta,
    vocab: meta.vocab,
    calendar: meta.calendar,
    nodes: list(graph.nodes).map((node) => normalizeNode(node)),
    edges: list(graph.edges).map((edge) => normalizeEdge(edge as GraphEdge)),
    chapters: list(graph.chapters).map((chapter) => normalizeChapter(chapter as Chapter)),
    varReads: {
      flag: varReads.flag ?? {},
      stat: varReads.stat ?? {},
      rel: varReads.rel ?? {},
    },
    missions,
    flagFacts,
    checkpoints: emptyCheckpoints,
    langs: meta.langs,
    systemEntries: meta.systemEntries,
    shardByNode: meta.shardByNode,
    checkpointShardByKey: meta.checkpointShardByKey,
    assetUrl: (name, vars) => assetUrl(index, name, vars),
  };
  return dataset;
};
