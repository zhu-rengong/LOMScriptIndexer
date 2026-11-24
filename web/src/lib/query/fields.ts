import { all as i18nAll } from "../../i18n";
import type { QueryField } from "../../types/query";

const FIELD_SPECS: QueryField[] = [
  { id: "speaker", kind: "text", aliases: ["speaker", "say"] },
  { id: "flag", kind: "text", aliases: ["flag", "flags"] },
  { id: "check", kind: "text", aliases: ["check", "checks"] },
  { id: "stat", kind: "text", aliases: ["stat", "stats"] },
  { id: "rel", kind: "text", aliases: ["rel"] },
  { id: "ending", kind: "text", aliases: ["ending", "endings", "death"] },
  { id: "chronicle", kind: "text", aliases: ["chronicle", "achievement"] },
  { id: "endgame", kind: "text", aliases: ["endgame"] },
  { id: "mission", kind: "text", aliases: ["mission"] },
  { id: "chapter", kind: "string", aliases: ["chapter"] },
];

export const FACET_KEY: Record<string, string> = {
  speaker: "speakers",
  flag: "flags",
  check: "checks",
  stat: "stats",
  rel: "relations",
  ending: "endings",
  chronicle: "chronicles",
  endgame: "endgames",
  mission: "missions",
};

export const ROOTS = ["AND", "OR", "NOT", "XOR"];

const aliasPairs = (key: string): Map<string, string> => {
  const map = new Map<string, string>();
  for (const pair of i18nAll(key)) {
    const parts = String(pair).split("=");
    if (parts.length === 2) map.set(parts[0].trim().toLowerCase(), parts[1].trim());
  }
  return map;
};

const build = (): {
  list: QueryField[];
  byId: Record<string, QueryField>;
  byAlias: Record<string, QueryField>;
} => {
  const list = FIELD_SPECS.map((field) => {
    const aliases = field.aliases.slice();
    for (const extra of i18nAll(`q.${field.id}`)) {
      if (aliases.indexOf(extra) < 0) aliases.push(extra);
    }
    return { ...field, aliases };
  });
  const byId: Record<string, QueryField> = {};
  const byAlias: Record<string, QueryField> = {};
  for (const field of list) {
    byId[field.id] = field;
    for (const alias of field.aliases) byAlias[String(alias).toLowerCase()] = field;
  }
  return { list, byId, byAlias };
};

const built = build();

export const FIELDS = built.list;

export const FIELD_BY_ID = built.byId;

export const FIELD_BY_ALIAS = built.byAlias;

export const LOGIC_ALIAS = aliasPairs("q.logic");

export const facetKey = (field: QueryField): string => FACET_KEY[field.id] || field.id;
