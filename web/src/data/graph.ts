import type { Chapter, GraphEdge, GraphNode } from "../types/graph";
import { EMPTY_CHAPTER, dataset } from "./dataset";

const FACET_FIELDS: Record<string, keyof GraphNode["facets"]> = {
  speaker: "speakers",
  flag: "flags",
  check: "checks",
  stat: "stats",
  rel: "relations",
};

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

const visibleMask = new Uint8Array(nodes.length);

const chapterOf = (node: GraphNode | null | undefined): Chapter =>
  (node ? chapters[node.chapterIndex] : undefined) || EMPTY_CHAPTER;

const passesFilter = (index: number, filterSet: Set<number> | null): boolean =>
  !filterSet || filterSet.has(index);

const computeVisibility = (filterSet: Set<number> | null, selectedId: string): void => {
  const selectedIndex = selectedId ? indexById.get(selectedId) : undefined;
  for (let index = 0; index < nodes.length; index++) {
    let show = passesFilter(index, filterSet);
    if (!show && index === selectedIndex) show = true;
    visibleMask[index] = show ? 1 : 0;
  }
};

let chapterBuckets: GraphNode[][] | null = null;

const nodesByChapter = (): GraphNode[][] => {
  if (chapterBuckets) return chapterBuckets;
  chapterBuckets = chapters.map(() => []);
  nodes.forEach((node) => {
    const bucket = chapterBuckets?.[node.chapterIndex];
    if (bucket) bucket.push(node);
  });
  return chapterBuckets;
};

const nextTargets = (node: GraphNode | null): { node: GraphNode; edge: GraphEdge }[] => {
  if (!node) return [];
  const index = indexById.get(node.id);
  if (index === undefined) return [];
  const seen = new Set<string>();
  const targets: { node: GraphNode; edge: GraphEdge }[] = [];
  for (const edge of outgoingByIndex[index]) {
    const target = nodeById.get(edge.target);
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);
    targets.push({ node: target, edge });
  }
  return targets;
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
  for (const node of nodes) {
    if (facetMatches(node, kind, key)) out.push(node);
  }
  return out;
};

type ReadKind = "flag" | "stat" | "rel";

const checkpointKeysOf = (kind: ReadKind, key: string): string[] =>
  key ? dataset.varReads[kind][key] || [] : [];

const checkpointReaderNodes = (kind: ReadKind, key: string): GraphNode[] => {
  const keys = checkpointKeysOf(kind, key);
  if (!keys.length) return [];
  return nodes.filter((node) => node.facets.checks.some((check) => keys.indexOf(check) >= 0));
};

const flagUsage = (key: string): { writers: GraphNode[]; checkers: GraphNode[] } => {
  const writers: GraphNode[] = [];
  const checkers: GraphNode[] = [];
  if (!key) return { writers, checkers };
  const readKeys = checkpointKeysOf("flag", key);
  for (const node of nodes) {
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
  chapters,
  chapterOf,
  checkpointReaderNodes,
  computeVisibility,
  edges,
  flagUsage,
  incomingByIndex,
  indexById,
  nextTargets,
  nodeById,
  nodes,
  nodesByChapter,
  nodesWithFacet,
  outgoingByIndex,
  passesFilter,
};
