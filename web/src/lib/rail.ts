import { graph } from "../data/graph";
import { specialScriptName, specialScripts } from "../data/special";
import { chapterTitle } from "../i18n";
import { toNeedle } from "./browser";

export type RailRow =
  | {
      kind: "chapter";
      key: string;
      index: number;
      title: string;
      open: boolean;
    }
  | {
      kind: "node";
      key: string;
      id: string;
    };

export type OutlineRows = {
  rows: RailRow[];
  matched: number;
};

export type BookmarkRow = {
  id: string;
  chapter: string;
  known: boolean;
};

export type SpecialRow = {
  id: string;
  name: string;
  known: boolean;
};

const lowerIds = graph.nodes.map((node) => node.id.toLowerCase());

const matchedNodeIds = (needle: string): Set<string> => {
  const hits = new Set<string>();
  for (let index = 0; index < lowerIds.length; index++) {
    if (lowerIds[index].indexOf(needle) >= 0) hits.add(graph.nodes[index].id);
  }
  return hits;
};

const matchedChapterIndexes = (needle: string): Set<number> => {
  const hits = new Set<number>();
  graph.chapters.forEach((chapter, index) => {
    const title = chapterTitle(chapter).toLowerCase();
    const id = String(chapter.id).toLowerCase();
    if (title.indexOf(needle) >= 0 || id.indexOf(needle) >= 0) hits.add(index);
  });
  return hits;
};

export const outlineRows = (query: string, openChapter: number): OutlineRows => {
  const needle = toNeedle(query);
  const byChapter = graph.nodesByChapter();
  const nodeHits = needle ? matchedNodeIds(needle) : null;
  const chapterHits = needle ? matchedChapterIndexes(needle) : null;
  const rows: RailRow[] = [];
  let matched = 0;
  graph.chapters.forEach((chapter, index) => {
    const all = byChapter[index] || [];
    const wholeChapter = chapterHits?.has(index) ?? false;
    const hits =
      !needle || wholeChapter ? all : all.filter((node) => nodeHits?.has(node.id) ?? false);
    if (needle && !hits.length) return;
    matched += hits.length;
    rows.push({
      kind: "chapter",
      key: `chapter:${index}`,
      index,
      title: chapterTitle(chapter),
      open: needle ? true : openChapter === index,
    });
    if (!needle && openChapter !== index) return;
    for (const node of hits) {
      rows.push({ kind: "node", key: `node:${node.id}`, id: node.id });
    }
  });
  return { rows, matched };
};

export const bookmarkRows = (query: string, ids: string[]): BookmarkRow[] => {
  const needle = toNeedle(query);
  const rows: BookmarkRow[] = [];
  for (const id of ids) {
    const node = graph.nodeById.get(id);
    const chapter = node ? chapterTitle(graph.chapterOf(node)) : "";
    if (needle && id.toLowerCase().indexOf(needle) < 0 && chapter.toLowerCase().indexOf(needle) < 0)
      continue;
    rows.push({ id, chapter, known: !!node });
  }
  return rows;
};

export const specialRows = (query: string, lang: string): SpecialRow[] => {
  const needle = toNeedle(query);
  return specialScripts
    .map((entry) => ({
      id: entry.id,
      name: specialScriptName(entry, lang),
      known: graph.nodeById.has(entry.id),
    }))
    .filter((row) => {
      if (!needle) return true;
      return (
        row.name.toLowerCase().indexOf(needle) >= 0 || row.id.toLowerCase().indexOf(needle) >= 0
      );
    });
};
