import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { t } from "../i18n";

import type { QueryContext, QueryError } from "../types/query";
import { createIndex, query, type QueryIndex } from "./query";
import { plainTextOfId } from "./searchText";
import { scriptStore as script } from "./scriptStore";

export const RESULT_LIMIT = 50;

export const FIELD_LABEL_KEYS: Record<string, string> = {
  speaker: "fieldSpeaker",
  flag: "fieldFlag",
  check: "fieldCheck",
  stat: "fieldStat",
  rel: "fieldRel",
  option: "fieldOption",
  lock: "fieldLock",
  dice: "fieldDice",
  ending: "fieldEnding",
  out: "fieldOut",
  in: "fieldIn",
  saycount: "fieldSay",
  id: "fieldId",
  chapter: "fieldChapter",
  text: "fieldText",
  kind: "fieldKind",
};

export const EXAMPLES: { key: string; expr: string }[] = [
  { key: "exLock", expr: "lock >= 1" },
  { key: "exDice", expr: "dice >= 1" },
  { key: "exEnding", expr: "ending:*" },
  { key: "exOptions", expr: "option >= 5" },
  { key: "exSpeaker", expr: "speaker:master" },
  { key: "exLeaf", expr: "out = 0" },
  { key: "exEntry", expr: "in = 0" },
  { key: "exChapter", expr: "chapter:ch1" },
  { key: "exCombo", expr: "speaker:master AND (dice:yes OR lock:yes)" },
];

let textLang = "";
let textCount = -1;
let compileCache: QueryIndex | null = null;

const nodeText = (index: number): string => {
  const node = graph.nodes[index];
  return node ? plainTextOfId(node.id) : "";
};

const buildIndex = (): QueryIndex => {
  const lang = script().textLang();
  const pack = textStore.pack(lang);
  const count = pack && pack.scripts ? Object.keys(pack.scripts).length : 0;
  if (compileCache && textLang === lang && textCount === count) return compileCache;
  textLang = lang;
  textCount = count;
  const names = textStore.names(lang);
  const context: QueryContext = {
    nodeCount: graph.nodes.length,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      chapterIndex: node.chapterIndex,
      outDegree: node.outDegree,
      inDegree: node.inDegree,
      sayCount: node.sayCount,
    })),
    chapters: graph.chapters,
    facets: graph.nodes.map((node) => node.facets),
    edgeGroup: graph.hasEdgeGroup,
    names: {
      speakers: textStore.characters(lang),
      flags: names.flag || {},
      checks: names.check || {},
      stats: names.stat || {},
      relations: names.rel || {},
      endings: names.ending || {},
    },
    textAt: nodeText,
  };
  compileCache = createIndex(context);
  return compileCache;
};

export const queryIndex = (): QueryIndex => buildIndex();

export const resetFilterContext = (): void => {
  textLang = "";
  textCount = -1;
  compileCache = null;
};

export const filterErrorText = (error: QueryError): string =>
  t("filterSyntax", {
    column: error.column,
    message: query.errorTextOf(error),
  });

export type ApplyResult = { ok: boolean; matchCount: number | null };

export const applyFilter = (source: string): ApplyResult => {
  const value = source || "";
  if (!value.trim()) {
    script().setFilterState({ source: "", set: null, error: "", loading: false });
    return { ok: true, matchCount: null };
  }
  const loading = query.needsText(value) && !textStore.progress().done;
  const result = query.compile(value, buildIndex());
  if (!result.ok) {
    script().setFilterState({
      source: value,
      set: null,
      error: filterErrorText(result.error),
      loading: false,
    });
    return { ok: false, matchCount: 0 };
  }
  script().setFilterState({ source: value, set: result.set, error: "", loading });
  if (loading) {
    textStore.ensureAll(script().textLang()).then(() => {
      resetFilterContext();
      if (script().filterSource !== value) return;
      const later = query.compile(value, buildIndex());
      script().setFilterState({
        source: value,
        set: later.ok ? later.set : null,
        error: later.ok ? "" : filterErrorText(later.error),
        loading: false,
      });
    });
  }
  return { ok: true, matchCount: result.set ? result.set.size : 0 };
};
