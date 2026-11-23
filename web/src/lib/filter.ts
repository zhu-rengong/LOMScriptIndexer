import { readDataset } from "../data/access";
import { flagFacts, isBinaryValues } from "../data/flagFacts";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { t } from "../i18n";
import type { QueryContext, QueryError } from "../types/query";
import { missionLabelTable } from "./missionLabel";
import { createIndex, query, type QueryIndex } from "./query";

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

const textOf = (key: string): string => {
  const text = t(key);
  return text === key ? "" : text;
};

const flagNames = (): Record<string, string> => {
  const names: Record<string, string> = {};
  const known = new Set<string>(Object.keys(readDataset().flagFacts.flags || {}));
  for (const node of graph.nodes) for (const key of node.facets.flags) known.add(key);
  for (const flag of known) {
    const fact = isBinaryValues(flagFacts[flag]?.values || []) ? textOf(`fact.${flag}.1`) : "";
    const name = fact || textOf(`measure.${flag}`);
    if (name) names[flag] = name;
  }
  return names;
};

class FilterCompiler {
  private lang = "";
  private count = -1;
  private cached: QueryIndex | null = null;

  build(): QueryIndex {
    const script = useScriptStore();
    const lang = script.textLang();
    const count = textStore.scriptCount();
    if (this.cached && this.lang === lang && this.count === count) return this.cached;
    this.lang = lang;
    this.count = count;
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
    this.cached = createIndex(context);
    return this.cached;
  }

  reset(): void {
    this.lang = "";
    this.count = -1;
    this.cached = null;
  }

  compile(source: string): ReturnType<typeof query.compile> {
    return query.compile(source, this.build());
  }
}

const filterCompiler = new FilterCompiler();

export const resetFilterContext = (): void => filterCompiler.reset();

export const queryIndex = (): QueryIndex => filterCompiler.build();

const filterErrorText = (error: QueryError): string =>
  t("filterSyntax", {
    column: error.column,
    message: query.errorTextOf(error),
  });

export type ApplyResult = { ok: boolean; matchCount: number | null };

export const applyFilter = (source: string): ApplyResult => {
  const script = useScriptStore();
  const value = source || "";
  if (!value.trim()) {
    script.setFilterState({ source: "", set: null, error: "", loading: false });
    return { ok: true, matchCount: null };
  }
  const loading = query.needsText(value) && !textStore.progress().done;
  const result = filterCompiler.compile(value);
  if (!result.ok) {
    script.setFilterState({
      source: value,
      set: null,
      error: filterErrorText(result.error),
      loading: false,
    });
    return { ok: false, matchCount: 0 };
  }
  script.setFilterState({ source: value, set: result.set, error: "", loading });
  if (loading) {
    textStore.ensureAll(script.textLang()).then(() => {
      filterCompiler.reset();
      if (script.filterSource !== value) return;
      const later = filterCompiler.compile(value);
      script.setFilterState({
        source: value,
        set: later.ok ? later.set : null,
        error: later.ok ? "" : filterErrorText(later.error),
        loading: false,
      });
    });
  }
  return { ok: true, matchCount: result.set ? result.set.size : 0 };
};
