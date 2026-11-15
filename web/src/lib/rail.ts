import type MiniSearch from "minisearch";
import { graph } from "../data/graph";
import { specialScriptName, specialScripts } from "../data/special";
import { chapterTitle } from "../i18n";
import type { Chapter, GraphNode } from "../types/graph";
import { toNeedle } from "./browser";
import { createSearchEngine, searchCandidates, type SearchDoc } from "./searchEngine";
import { scriptStore as script } from "./scriptStore";

export const SEARCH_MEMBER_LIMIT = 200;

export type ChapterRow = {
  index: number;
  chapter: Chapter;
  title: string;
  ordinal: string;
  members: GraphNode[];
  total: number;
  hidden: number;
  open: boolean;
};

export type BookmarkRow = {
  id: string;
  chapter: string;
  index: number;
  known: boolean;
};

export type SpecialRow = {
  id: string;
  name: string;
  known: boolean;
};

type MetaEntry = {
  key: string;
  text: string;
  kind: "chapter" | "node" | "special";
  ref: string;
  verify: string[];
};

type MetaState = {
  key: string;
  engine: MiniSearch<SearchDoc>;
  entries: MetaEntry[];
};

export const nodeIndexOf = (id: string): number => graph.indexById.get(id) ?? -1;

const buildMeta = (lang: string, key: string): MetaState => {
  const entries: MetaEntry[] = [];
  graph.chapters.forEach((chapter, index) => {
    const title = chapterTitle(chapter).toLowerCase();
    const id = String(chapter.id).toLowerCase();
    entries.push({
      key: `chapter:${index}`,
      text: `${title}\n${id}`,
      kind: "chapter",
      ref: String(index),
      verify: [title, id],
    });
  });
  graph.nodes.forEach((node) => {
    const id = node.id.toLowerCase();
    entries.push({ key: `node:${node.id}`, text: id, kind: "node", ref: node.id, verify: [id] });
  });
  specialScripts.forEach((entry) => {
    const name = specialScriptName(entry, lang).toLowerCase();
    const id = entry.id.toLowerCase();
    entries.push({
      key: `special:${entry.id}`,
      text: `${name}\n${id}`,
      kind: "special",
      ref: entry.id,
      verify: [name, id],
    });
  });
  const engine = createSearchEngine();
  engine.addAll(entries.map((entry) => ({ key: entry.key, text: entry.text })));
  return { key, engine, entries };
};

let metaState: MetaState | null = null;

const metaFor = (lang: string): MetaState => {
  const key = `${script().lang}|${lang}`;
  if (metaState && metaState.key === key) return metaState;
  metaState = buildMeta(lang, key);
  return metaState;
};

const matchedEntries = (state: MetaState, needle: string): MetaEntry[] => {
  const keys = searchCandidates(state.engine, needle);
  const allowed = keys === null ? null : new Set(keys);
  const out: MetaEntry[] = [];
  for (const entry of state.entries) {
    if (allowed && !allowed.has(entry.key)) continue;
    if (!entry.verify.some((value) => value.indexOf(needle) >= 0)) continue;
    out.push(entry);
  }
  return out;
};

export const outlineRows = (query: string, openChapter: number): ChapterRow[] => {
  const needle = toNeedle(query);
  const byChapter = graph.nodesByChapter();
  const chapterHits = new Set<number>();
  const nodeHits = new Set<string>();
  if (needle) {
    for (const entry of matchedEntries(metaFor(script().lang), needle)) {
      if (entry.kind === "chapter") chapterHits.add(Number(entry.ref));
      else if (entry.kind === "node") nodeHits.add(entry.ref);
    }
  }
  const rows: ChapterRow[] = [];
  graph.chapters.forEach((chapter, index) => {
    const title = chapterTitle(chapter);
    let members = byChapter[index] || [];
    if (needle) {
      if (!chapterHits.has(index)) members = members.filter((node) => nodeHits.has(node.id));
      if (!members.length) return;
    }
    const total = members.length;
    const shown = needle ? members.slice(0, SEARCH_MEMBER_LIMIT) : members;
    rows.push({
      index,
      chapter,
      title,
      ordinal: String(index + 1).padStart(2, "0"),
      members: shown,
      total,
      hidden: total - shown.length,
      open: needle ? true : openChapter === index,
    });
  });
  return rows;
};

export const bookmarkRows = (query: string, ids: string[]): BookmarkRow[] => {
  const needle = toNeedle(query);
  const state = needle ? metaFor(script().lang) : null;
  const candidates = needle && state ? searchCandidates(state.engine, needle) : null;
  const allowed = candidates === null ? null : new Set(candidates);
  const rows: BookmarkRow[] = [];
  for (const id of ids) {
    const node = graph.nodeById.get(id);
    const chapter = node ? chapterTitle(graph.chapterOf(node)) : "";
    if (needle) {
      const chapterKey = node ? `chapter:${node.chapterIndex}` : "";
      const candidate =
        !allowed || allowed.has(`node:${id}`) || (chapterKey !== "" && allowed.has(chapterKey));
      if (!candidate) continue;
      if (id.toLowerCase().indexOf(needle) < 0 && chapter.toLowerCase().indexOf(needle) < 0)
        continue;
    }
    rows.push({ id, chapter, index: nodeIndexOf(id), known: !!node });
  }
  return rows;
};

export const specialRows = (query: string, lang: string): SpecialRow[] => {
  const needle = toNeedle(query);
  const state = needle ? metaFor(lang) : null;
  const candidates = needle && state ? searchCandidates(state.engine, needle) : null;
  const allowed = candidates === null ? null : new Set(candidates);
  return specialScripts
    .map((entry) => ({
      id: entry.id,
      name: specialScriptName(entry, lang),
      known: graph.nodeById.has(entry.id),
    }))
    .filter((row) => {
      if (!needle) return true;
      if (allowed && !allowed.has(`special:${row.id}`)) return false;
      return (
        row.name.toLowerCase().indexOf(needle) >= 0 || row.id.toLowerCase().indexOf(needle) >= 0
      );
    });
};

export const chapterMatchCount = (rows: ChapterRow[]): number =>
  rows.reduce((sum, row) => sum + row.total, 0);
