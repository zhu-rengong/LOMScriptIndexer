import type { Facets } from "./graph";

export type QueryField = {
  id: string;
  kind: string;
  aliases: string[];
};

export type QueryError = {
  key: string;
  params: Record<string, unknown>;
  message: string;
  column: number;
};

export type QueryTerm = {
  type: "term";
  field: string;
  op: string;
  value: string | number;
  offset: number;
};

export type QueryNode =
  | { type: "or" | "and" | "xor"; left: QueryNode; right: QueryNode }
  | { type: "not"; operand: QueryNode }
  | QueryTerm;

export type QueryContext = {
  nodeCount: number;
  nodes: { chapterIndex: number }[];
  chapters: { id: string; scriptCount: number; [key: string]: unknown }[];
  facets: Facets[];
  names: Record<string, Record<string, string>>;
};

export type QueryValue = {
  value: string;
  label: string;
  count: number;
};

export type QuerySuggestion = {
  value: string;
  label: string;
  count: number | null;
  insert?: string;
  kind?: string;
};
