import { dataset } from "../data/dataset";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { t } from "../i18n";

import type { QueryContext, QueryError } from "../types/query";
import { missionLabelTable } from "./missionLabel";
import { createIndex, query, type QueryIndex } from "./query";
import { scriptStore as script } from "./scriptStore";

export const RESULT_LIMIT = 50;

export const FIELD_LABEL_KEYS: Record<string, string> = {
  speaker: "fieldSpeaker",
  flag: "fieldFlag",
  check: "fieldCheck",
  stat: "fieldStat",
  rel: "fieldRel",
  ending: "fieldEnding",
  mission: "fieldMission",
  chapter: "fieldChapter",
};

export const EXAMPLES: { key: string; expr: string }[] = [
  { key: "exEnding", expr: "ending:*" },
  { key: "exSpeaker", expr: "speaker:master" },
  { key: "exChapter", expr: "chapter:ch1" },
  { key: "exCombo", expr: "speaker:master AND (flag:H00001 OR ending:*)" },
];

let textLang = "";
let textCount = -1;
let compileCache: QueryIndex | null = null;

const textOf = (key: string): string => {
  const text = t(key);
  return text === key ? "" : text;
};

const isBinaryFlag = (values: string[]): boolean =>
  values.length > 0 &&
  values.indexOf("1") >= 0 &&
  values.every((value) => value === "0" || value === "1");

const inferredFlagName = (flag: string, values: string[]): string => {
  if (isBinaryFlag(values)) {
    const fact = textOf(`fact.${flag}.1`);
    if (fact) return fact;
  }
  return textOf(`measure.${flag}`);
};

const flagNames = (): Record<string, string> => {
  const facts = dataset.flagFacts.flags || {};
  const out: Record<string, string> = {};
  const keys = new Set<string>(Object.keys(facts));
  for (const node of graph.nodes) for (const key of node.facets.flags) keys.add(key);
  for (const flag of keys) {
    const name = inferredFlagName(flag, facts[flag]?.values || []);
    if (name) out[flag] = name;
  }
  return out;
};

const buildIndex = (): QueryIndex => {
  const lang = script().textLang();
  const count = textStore.scriptCount();
  if (compileCache && textLang === lang && textCount === count) return compileCache;
  textLang = lang;
  textCount = count;
  const names = textStore.names(lang);
  const context: QueryContext = {
    nodeCount: graph.nodes.length,
    nodes: graph.nodes.map((node) => ({ chapterIndex: node.chapterIndex })),
    chapters: graph.chapters,
    facets: graph.nodes.map((node) => node.facets),
    names: {
      speakers: textStore.characters(lang),
      flags: flagNames(),
      checks: names.check || {},
      stats: names.stat || {},
      relations: names.rel || {},
      endings: names.ending || {},
      missions: missionLabelTable(),
    },
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
