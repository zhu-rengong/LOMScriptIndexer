import type { Chapter, GraphEdge, GraphNode } from "../types/graph";
import { readDataset } from "./access";
import { EMPTY_CHAPTER } from "./chapters";

const FACET_FIELDS: Record<string, keyof GraphNode["facets"]> = {
  speaker: "speakers",
  flag: "flags",
  check: "checks",
  stat: "stats",
  rel: "relations",
};

type GraphIndex = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  chapters: Chapter[];
  nodeById: Map<string, GraphNode>;
  indexById: Map<string, number>;
  incomingByIndex: GraphEdge[][];
  outgoingByIndex: GraphEdge[][];
  chapterBuckets: GraphNode[][] | null;
};

let built: GraphIndex | null = null;

const build = (): GraphIndex => {
  const dataset = readDataset();
  const nodes = dataset.nodes;
  const edges = dataset.edges;
  const chapters = dataset.chapters;
  const nodeById = new Map<string, GraphNode>();
  const indexById = new Map<string, number>();
  nodes.forEach((node, index) => {
    nodeById.set(node.id, node);
    indexById.set(node.id, index);
  });
  const outgoingByIndex: GraphEdge[][] = nodes.map(() => []);
  const incomingByIndex: GraphEdge[][] = nodes.map(() => []);
  for (const edge of edges) {
    const sourceIndex = indexById.get(edge.source);
    const targetIndex = indexById.get(edge.target);
    if (sourceIndex === undefined || targetIndex === undefined) continue;
    outgoingByIndex[sourceIndex].push(edge);
    incomingByIndex[targetIndex].push(edge);
  }
  return {
    nodes,
    edges,
    chapters,
    nodeById,
    indexById,
    incomingByIndex,
    outgoingByIndex,
    chapterBuckets: null,
  };
};

const index = (): GraphIndex => (built ??= build());

const chapterOf = (node: GraphNode | null | undefined): Chapter =>
  (node ? index().chapters[node.chapterIndex] : undefined) || EMPTY_CHAPTER;

const passesFilter = (position: number, filterSet: Set<number> | null): boolean =>
  !filterSet || filterSet.has(position);

const nodesByChapter = (): GraphNode[][] => {
  const state = index();
  if (state.chapterBuckets) return state.chapterBuckets;
  const buckets = state.chapters.map(() => [] as GraphNode[]);
  state.nodes.forEach((node) => {
    const bucket = buckets[node.chapterIndex];
    if (bucket) bucket.push(node);
  });
  state.chapterBuckets = buckets;
  return buckets;
};

const facetMatches = (node: GraphNode, kind: string, key: string): boolean => {
  if (!key) return false;
  const field = FACET_FIELDS[kind];
  if (!field) return false;
  const values = node.facets[field];
  return Array.isArray(values) && values.indexOf(key) >= 0;
};

const nodesWithFacet = (kind: string, key: string): GraphNode[] => {
  const out: GraphNode[] = [];
  for (const node of index().nodes) {
    if (facetMatches(node, kind, key)) out.push(node);
  }
  return out;
};

const missionTriggerNodes = (stateKey: string): GraphNode[] => {
  if (!stateKey) return [];
  return index().nodes.filter((node) => node.missionStates.indexOf(stateKey) >= 0);
};

const missionEndNodes = (missionId: string): GraphNode[] => {
  if (!missionId) return [];
  return index().nodes.filter((node) => node.missionEnds.indexOf(missionId) >= 0);
};

type ReadKind = "flag" | "stat" | "rel";

const checkpointKeysOf = (kind: ReadKind, key: string): string[] =>
  key ? readDataset().varReads[kind][key] || [] : [];

const checkpointReaderNodes = (kind: ReadKind, key: string): GraphNode[] => {
  const keys = checkpointKeysOf(kind, key);
  if (!keys.length) return [];
  return index().nodes.filter((node) =>
    node.facets.checks.some((check) => keys.indexOf(check) >= 0),
  );
};

const flagUsage = (key: string): { writers: GraphNode[]; checkers: GraphNode[] } => {
  const writers: GraphNode[] = [];
  const checkers: GraphNode[] = [];
  if (!key) return { writers, checkers };
  const readKeys = checkpointKeysOf("flag", key);
  for (const node of index().nodes) {
    if (node.facets.flags.indexOf(key) >= 0) writers.push(node);
    if (readKeys.length && node.facets.checks.some((check) => readKeys.indexOf(check) >= 0)) {
      checkers.push(node);
      continue;
    }
    if (node.facets.checks.some((check) => check === key || check.indexOf(`${key}_`) === 0)) {
      checkers.push(node);
    }
  }
  return { writers, checkers };
};

export const graph = {
  get chapters(): Chapter[] {
    return index().chapters;
  },
  chapterOf,
  checkpointReaderNodes,
  get edges(): GraphEdge[] {
    return index().edges;
  },
  flagUsage,
  get incomingByIndex(): GraphEdge[][] {
    return index().incomingByIndex;
  },
  get indexById(): Map<string, number> {
    return index().indexById;
  },
  missionEndNodes,
  missionTriggerNodes,
  get nodeById(): Map<string, GraphNode> {
    return index().nodeById;
  },
  get nodes(): GraphNode[] {
    return index().nodes;
  },
  nodesByChapter,
  nodesWithFacet,
  get outgoingByIndex(): GraphEdge[][] {
    return index().outgoingByIndex;
  },
  passesFilter,
};
