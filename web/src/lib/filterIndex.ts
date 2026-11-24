import { readDataset } from "../data/access";
import { flagFacts, isBinaryValues } from "../data/flagFacts";
import { graph } from "../data/graph";
import { textStore } from "../data/text";
import { t, tOr } from "../i18n";
import type { QueryContext, QueryError } from "../types/query";
import { missionLabelTable } from "./missionLabel";
import { createIndex, query, type QueryIndex } from "./query";

const textOf = (key: string): string => tOr(key, "");

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

export class FilterIndex {
  private lang = "";
  private count = -1;
  private cached: QueryIndex | null = null;

  build(): QueryIndex {
    const script = useScriptStore(pinia);
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
        chronicles: names.chronicle || {},
        endgames: names.endgame || {},
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

export const filterErrorText = (error: QueryError): string =>
  t("filterSyntax", {
    column: error.column,
    message: query.errorTextOf(error),
  });
