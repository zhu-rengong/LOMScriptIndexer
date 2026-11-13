import * as v from "valibot";
import type { DataIndex } from "../types/generated";

const pending = new Map<string, Promise<unknown>>();
const cache = new Map<string, unknown>();

export const fetchJson = <T>(url: string): Promise<T> => {
  const hit = cache.get(url);
  if (hit !== undefined) return Promise.resolve(hit as T);
  const job = pending.get(url);
  if (job) return job as Promise<T>;
  const next = fetch(url, { cache: "no-cache" })
    .then((response) => {
      if (!response.ok) throw new Error(`${url} -> ${response.status}`);
      return response.json() as Promise<T>;
    })
    .then((payload) => {
      cache.set(url, payload);
      pending.delete(url);
      return payload;
    })
    .catch((error: unknown) => {
      pending.delete(url);
      throw error;
    });
  pending.set(url, next);
  return next;
};

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
