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

export const fetchJson = <T>(url: string): Promise<T> =>
  queryClient.fetchQuery({
    queryKey: ["artifact", url],
    queryFn: async () => {
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      return (await response.json()) as T;
    },
  });

export const loadIndex = async (): Promise<DataIndex> =>
  v.parse(IndexSchema, await fetchJson<unknown>("data/index.json")) as DataIndex;

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
