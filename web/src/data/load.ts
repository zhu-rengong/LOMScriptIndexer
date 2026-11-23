import * as v from "valibot";
import { queryClient } from "../api/query";
import type { DataIndex } from "../types/generated";

const ArtifactSchema = v.object({
  url: v.string(),
  schema: v.optional(v.string(), ""),
  count: v.optional(v.number(), 0),
  shards: v.optional(v.array(v.string()), []),
});

const IndexSchema = v.object({
  schema: v.string(),
  generated: v.optional(v.string(), ""),
  langs: v.array(v.string()),
  defaultLang: v.string(),
  sourceLang: v.string(),
  artifacts: v.record(v.string(), ArtifactSchema),
});

const looseArray = v.custom<unknown[]>((value) => Array.isArray(value), "expected an array");

const looseRecord = v.custom<Record<string, unknown>>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
  "expected an object",
);

export const GraphSchema = v.object({
  schema: v.string(),
  meta: v.object({
    langs: v.array(v.string()),
    sourceLang: v.optional(v.string(), ""),
    shards: looseArray,
    shardByNode: looseRecord,
    checkpointShardByKey: looseRecord,
  }),
  nodes: looseArray,
  edges: looseArray,
  chapters: looseArray,
});

export const MissionSchema = v.object({
  schema: v.string(),
  items: looseRecord,
});

export const TextHeadSchema = v.object({
  schema: v.string(),
  lang: v.string(),
  characters: looseRecord,
  titles: looseRecord,
  names: looseRecord,
  edgeLabels: looseRecord,
  shardKeys: v.array(v.string()),
});

export const fetchJson = <T>(url: string): Promise<T> =>
  queryClient.fetchQuery({
    queryKey: ["artifact", url],
    queryFn: async () => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      return (await response.json()) as T;
    },
  });

const check = <T>(schema: v.GenericSchema, label: string, value: unknown): T => {
  const result = v.safeParse(schema, value);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue.path?.map((item) => String(item.key)).join(".") || "root";
    throw new Error(`${label} payload is invalid at ${path}: ${issue.message}`);
  }
  return result.output as T;
};

export const fetchValidated = <T>(
  url: string,
  schema: v.GenericSchema,
  label: string,
): Promise<T> => fetchJson<unknown>(url).then((raw) => check<T>(schema, label, raw));

export const loadIndex = async (): Promise<DataIndex> => {
  const raw = await fetchJson<unknown>("data/index.json");
  return check<DataIndex>(IndexSchema, "index", raw);
};

export const assetUrl = (
  index: DataIndex,
  name: string,
  vars: Record<string, string | number> = {},
): string => {
  const artifact = (index.artifacts ?? {})[name];
  if (!artifact) throw new Error(`unknown data artifact: ${name}`);
  const url = artifact.url ?? "";
  return url.replace(/\{(\w+)\}/g, (whole, key: string) =>
    vars[key] === undefined ? whole : String(vars[key]),
  );
};
