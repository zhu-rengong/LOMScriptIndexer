import { chapterTitle } from "../../i18n";
import type {
  QueryContext,
  QueryError,
  QueryField,
  QueryNode,
  QueryTerm,
  QueryValue,
} from "../../types/query";
import { describeError } from "./error";
import { FIELD_BY_ID, facetKey } from "./fields";
import { parse, type ParseResult } from "./parser";

const union = (a: Set<number> | null, b: Set<number> | null): Set<number> | null => {
  if (!a) return b;
  if (!b) return a;
  const out = new Set(a);
  for (const value of b) out.add(value);
  return out;
};

const intersect = (a: Set<number> | null, b: Set<number> | null): Set<number> | null => {
  if (!a) return b ? new Set(b) : null;
  if (!b) return new Set(a);
  const small = a.size <= b.size ? a : b;
  const big = small === a ? b : a;
  const out = new Set<number>();
  for (const value of small) if (big.has(value)) out.add(value);
  return out;
};

const valuesOf = (row: unknown, field: QueryField): string[] => {
  const raw = row ? (row as Record<string, unknown>)[facetKey(field)] : undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.map(String) : String(raw).split(",");
};

export class QueryIndex {
  private context: QueryContext;
  private all: Set<number> | null = null;
  private facets = new Map<string, Map<string, Set<number>>>();
  private cache = new Map<string, QueryValue[]>();

  constructor(context: QueryContext) {
    this.context = context;
  }

  universe(): Set<number> {
    if (!this.all) {
      const set = new Set<number>();
      for (let index = 0; index < this.context.nodeCount; index++) set.add(index);
      this.all = set;
    }
    return this.all;
  }

  complement(set: Set<number> | null): Set<number> {
    const out = new Set<number>();
    for (const value of this.universe()) if (!set || !set.has(value)) out.add(value);
    return out;
  }

  facetIndex(field: QueryField): Map<string, Set<number>> {
    const cached = this.facets.get(field.id);
    if (cached) return cached;
    const map = new Map<string, Set<number>>();
    for (let index = 0; index < this.context.nodeCount; index++) {
      for (const key of valuesOf(this.context.facets[index], field)) {
        if (!key) continue;
        const lower = key.toLowerCase();
        let bucket = map.get(lower);
        if (!bucket) {
          bucket = new Set<number>();
          map.set(lower, bucket);
        }
        bucket.add(index);
      }
    }
    const labels = this.context.names[facetKey(field)];
    if (labels) {
      for (const key of Object.keys(labels)) {
        const bucket = map.get(key.toLowerCase());
        if (!bucket) continue;
        const label = String(labels[key] || "").toLowerCase();
        if (!label || label === key.toLowerCase()) continue;
        let named = map.get(label);
        if (!named) {
          named = new Set<number>();
          map.set(label, named);
        }
        for (const value of bucket) named.add(value);
      }
    }
    this.facets.set(field.id, map);
    return map;
  }

  facetValues(field: QueryField): QueryValue[] {
    const cached = this.cache.get(field.id);
    if (cached) return cached;
    if (field.id === "chapter") {
      const out = this.context.chapters.map((chapter) => ({
        value: String(chapter.id),
        label: chapterTitle(chapter as { kind?: string; number?: number | null }),
        count: Number(chapter.scriptCount) || 0,
      }));
      this.cache.set(field.id, out);
      return out;
    }
    const counts = new Map<string, number>();
    for (let index = 0; index < this.context.nodeCount; index++) {
      for (const key of valuesOf(this.context.facets[index], field)) {
        if (!key) continue;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const labels = this.context.names[facetKey(field)] || {};
    const out: QueryValue[] = [];
    for (const [key, count] of counts) {
      out.push({ value: key, label: labels[key] || "", count });
    }
    out.sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : 1));
    this.cache.set(field.id, out);
    return out;
  }

  textSet(term: QueryTerm, field: QueryField): Set<number> {
    const map = this.facetIndex(field);
    const needle = String(term.value).toLowerCase();
    const out = new Set<number>();
    if (needle === "*") {
      for (const bucket of map.values()) for (const value of bucket) out.add(value);
      return term.op === "ne" ? this.complement(out) : out;
    }
    const hit = map.get(needle);
    if (hit) for (const value of hit) out.add(value);
    return term.op === "ne" ? this.complement(out) : out;
  }

  stringSet(term: QueryTerm): Set<number> {
    const needle = String(term.value).toLowerCase();
    const out = new Set<number>();
    for (let index = 0; index < this.context.nodeCount; index++) {
      const chapter = this.context.chapters[this.context.nodes[index].chapterIndex] || { id: "" };
      const title = chapterTitle(chapter as { kind?: string; number?: number | null });
      const hit =
        String(chapter.id || "").toLowerCase() === needle || title.toLowerCase() === needle;
      if (term.op === "ne" ? !hit : hit) out.add(index);
    }
    return out;
  }

  evaluate(node: QueryNode | null): Set<number> {
    if (!node) return this.universe();
    switch (node.type) {
      case "or":
        return union(this.evaluate(node.left), this.evaluate(node.right)) as Set<number>;
      case "xor": {
        const a = this.evaluate(node.left);
        const b = this.evaluate(node.right);
        const only = new Set<number>();
        for (const value of a) if (!b.has(value)) only.add(value);
        for (const value of b) if (!a.has(value)) only.add(value);
        return only;
      }
      case "and":
        return intersect(this.evaluate(node.left), this.evaluate(node.right)) as Set<number>;
      case "not":
        return this.complement(this.evaluate(node.operand));
      case "term": {
        const field = FIELD_BY_ID[node.field];
        if (field.kind === "string") return this.stringSet(node);
        return this.textSet(node, field);
      }
      default:
        return this.universe();
    }
  }
}

export type CompileResult =
  | { ok: true; ast: QueryNode | null; set: Set<number> | null }
  | { ok: false; error: QueryError };

export const compile = (source: string, index: QueryIndex): CompileResult => {
  const parsed: ParseResult = parse(source);
  if (!parsed.ok) return parsed;
  if (!parsed.ast) return { ok: true, ast: null, set: null };
  try {
    return { ok: true, ast: parsed.ast, set: index.evaluate(parsed.ast) };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
};
