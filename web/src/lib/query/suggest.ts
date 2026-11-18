import type MiniSearch from "minisearch";
import type { QueryField, QuerySuggestion } from "../../types/query";
import { createSearchEngine, searchCandidates, type SearchDoc } from "../searchEngine";
import { FIELDS, FIELD_BY_ALIAS, LOGIC_ALIAS, ROOTS } from "./fields";
import type { QueryIndex } from "./evaluate";

const logicWordAt = (rest: string): string => {
  for (const word of ROOTS) {
    if (new RegExp(`^${word}(?=[\\s(]|$)`, "i").test(rest)) return word;
  }
  for (const word of LOGIC_ALIAS.keys()) {
    if (word && rest.toLowerCase().indexOf(word) === 0) return word;
  }
  return "";
};

const termStart = (source: string, cursor: number): number => {
  let start = 0;
  let quote: string | null = null;
  let index = 0;
  while (index < cursor) {
    const ch = source[index];
    if (quote) {
      if (ch === quote) quote = null;
      index++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      index++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      start = index + 1;
      index++;
      continue;
    }
    const boundary = index === 0 || /[\s()]/.test(source[index - 1]);
    if (boundary) {
      const word = logicWordAt(source.slice(index, cursor));
      if (word) {
        start = index + word.length;
        index = start;
        continue;
      }
    }
    index++;
  }
  while (start < cursor && /\s/.test(source[start])) start++;
  return start;
};

const findOperator = (segment: string): number => {
  let quote: string | null = null;
  for (let index = 0; index < segment.length; index++) {
    const ch = segment[index];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (":=><!".indexOf(ch) >= 0) return index;
  }
  return -1;
};

const needsQuote = (value: string): boolean => !/^[A-Za-z0-9_.\-\u4e00-\u9fff]+$/.test(value);

const formatInsert = (value: string, quoted: boolean): string => {
  if (!quoted && !needsQuote(value)) return value;
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

const rank = (items: QuerySuggestion[], prefix: string): QuerySuggestion[] => {
  const needle = String(prefix || "").toLowerCase();
  const scored: { item: QuerySuggestion; score: number }[] = [];
  for (const item of items) {
    const value = String(item.value).toLowerCase();
    const label = String(item.label || "").toLowerCase();
    let score = -1;
    if (!needle) score = 0;
    else if (value.indexOf(needle) === 0 || label.indexOf(needle) === 0) score = 0;
    else if (value.indexOf(needle) >= 0 || label.indexOf(needle) >= 0) score = 1;
    if (score < 0) continue;
    scored.push({ item, score });
  }
  scored.sort((a, b) =>
    a.score !== b.score ? a.score - b.score : (b.item.count || 0) - (a.item.count || 0),
  );
  return scored.map((entry) => entry.item);
};

type FacetState = {
  source: QueryIndex;
  engine: MiniSearch<SearchDoc>;
};

const facetStates = new Map<string, FacetState>();

const facetFilter = (source: QueryIndex, field: QueryField, needle: string): Set<string> | null => {
  let state = facetStates.get(field.id);
  if (!state || state.source !== source) {
    const docs = source.facetValues(field).map((item, index) => ({
      key: String(index),
      text: `${item.value}\n${item.label}`.toLowerCase(),
    }));
    const engine = createSearchEngine();
    engine.addAll(docs);
    state = { source, engine };
    facetStates.set(field.id, state);
  }
  const keys = searchCandidates(state.engine, needle);
  return keys === null ? null : new Set(keys);
};

export type SuggestResult = {
  mode: "field" | "value";
  field: string | null;
  from: number;
  to: number;
  prefix: string;
  quoted?: boolean;
  items: QuerySuggestion[];
};

export const suggest = (source: string, cursor: number, index: QueryIndex): SuggestResult => {
  const text = String(source || "");
  const at = cursor === undefined || cursor === null || cursor > text.length ? text.length : cursor;
  const start = termStart(text, at);
  const segment = text.slice(start, at);
  const opIndex = findOperator(segment);

  if (opIndex < 0) {
    const prefix = segment.trim();
    const fields: QuerySuggestion[] = FIELDS.map((field) => ({
      value: field.id,
      label: field.aliases.slice(1).join(" / "),
      count: null,
      insert: `${field.id}:`,
      kind: "field",
    }));
    if (!prefix) {
      fields.push({ value: "NOT", label: "", count: null, insert: "NOT ", kind: "logic" });
      fields.push({ value: "(", label: "", count: null, insert: "(", kind: "logic" });
    }
    return {
      mode: "field",
      field: null,
      from: start + (segment.length - segment.replace(/^\s+/, "").length),
      to: at,
      prefix,
      items: rank(fields, prefix),
    };
  }

  const fieldText = segment.slice(0, opIndex).trim();
  const field = FIELD_BY_ALIAS[fieldText.toLowerCase()];
  if (!field) {
    return { mode: "field", field: null, from: start, to: at, prefix: fieldText, items: [] };
  }

  const rest = segment.slice(opIndex);
  const opMatch = /^(>=|<=|!=|[:=<>])/.exec(rest);
  const opEnd = opIndex + (opMatch ? opMatch[0].length : 1);
  let valueStart = start + opEnd;
  while (valueStart < at && /\s/.test(text[valueStart])) valueStart++;

  let quoted = false;
  if (text[valueStart] === '"' || text[valueStart] === "'") {
    quoted = true;
    valueStart += 1;
  }
  const valuePrefix = text.slice(valueStart, at);

  const candidates: QuerySuggestion[] = [];
  for (const entry of index.facetValues(field)) {
    candidates.push({
      value: entry.value,
      label: entry.label,
      count: entry.count,
      insert: formatInsert(entry.value, quoted),
    });
  }

  const needle = valuePrefix.toLowerCase();
  const allowed = needle !== "" ? facetFilter(index, field, needle) : null;
  const filtered =
    allowed === null
      ? candidates
      : candidates.filter((_, position) => allowed.has(String(position)));

  return {
    mode: "value",
    field: field.id,
    from: valueStart,
    to: at,
    prefix: valuePrefix,
    quoted,
    items: rank(filtered, valuePrefix),
  };
};
