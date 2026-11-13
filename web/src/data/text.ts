import type { TextShardPayload, TextHeadPayload } from "../types/generated";
import type { BeatRow } from "../types/beats";
import type { ShardState, TextPack, TextProgress } from "../types/text";
import { t } from "../i18n";
import { pinia } from "../stores";
import { useUiStore } from "../stores/ui";
import { convert } from "./convert";
import { dataset } from "./dataset";
import { fetchJson } from "./load";

let uiHandle: ReturnType<typeof useUiStore> | null = null;

const ui = (): ReturnType<typeof useUiStore> => (uiHandle ??= useUiStore(pinia));

const SHARD_TIMEOUT = 30000;

const graphMeta = dataset.meta;
const sourceLang = graphMeta.sourceLang || graphMeta.langs[0] || "";
const shardKeys = graphMeta.shards.map((shard) => shard.key);

const shardProgress = reactive({
  headState: "idle" as ShardState,
  shards: {} as Record<string, ShardState>,
  headError: "",
  shardError: "",
});

let pack: TextPack | null = null;
let headPromise: Promise<boolean> | null = null;
const pendingShards = new Map<string, Promise<boolean>>();

type TextTable = Record<string, string>;
type NameTable = Record<string, Record<string, string>>;

type LangCache = {
  pack: TextPack | null;
  characters: TextTable | null;
  titles: TextTable | null;
  names: NameTable | null;
  edgeLabels: TextTable | null;
  beatRowsById: Record<string, BeatRow[]>;
};

const caches = new Map<string, LangCache>();

const cacheOf = (lang: string): LangCache => {
  let cache = caches.get(lang);
  if (!cache) {
    cache = {
      pack: null,
      characters: null,
      titles: null,
      names: null,
      edgeLabels: null,
      beatRowsById: {},
    };
    caches.set(lang, cache);
  }
  return cache;
};

const sourcePack = (): TextPack | null => pack;

const sourceBeatRows = (): Record<string, BeatRow[]> | null => pack?.scripts || null;

const hasConverted = (lang: string): boolean => lang !== sourceLang && convert.hasConverter(lang);

const ensureConvert = (lang: string): Promise<boolean> => {
  if (lang === sourceLang) return Promise.resolve(true);
  if (convert.hasConverter(lang)) return Promise.resolve(true);
  return convert.ensureConverter(lang);
};

const loadHead = (): Promise<boolean> => {
  shardProgress.headState = "loading";
  headPromise = fetchJson<TextHeadPayload>(dataset.assetUrl("textHead", { lang: sourceLang }))
    .then((head) => {
      pack = {
        schema: head.schema,
        lang: head.lang,
        missingKeyCount: head.missingKeyCount ?? 0,
        missingKeys: head.missingKeys ?? [],
        shardKeys: head.shardKeys ?? [],
        characters: head.characters ?? {},
        titles: head.titles ?? {},
        names: head.names ?? {},
        edgeLabels: head.edgeLabels ?? {},
        scripts: {},
      };
      shardProgress.headState = "ready";
      shardProgress.headError = "";
      return true;
    })
    .catch((error: unknown) => {
      shardProgress.headState = "failed";
      shardProgress.headError = error instanceof Error ? error.message : String(error);
      ui().toast(t("langFailed", { lang: sourceLang }));
      return false;
    });
  return headPromise;
};

const ensureHead = (lang: string): Promise<boolean> => {
  const current =
    shardProgress.headState === "ready"
      ? Promise.resolve(true)
      : shardProgress.headState === "loading" && headPromise
        ? headPromise
        : loadHead();
  return Promise.all([current, ensureConvert(lang)]).then(([headOk, convertedOk]) => {
    if (!headOk) return false;
    if (!convertedOk && lang !== sourceLang) {
      ui().toast(t("langFailed", { lang }));
      return false;
    }
    return true;
  });
};

const ensureShard = (lang: string, key: string): Promise<boolean> => {
  if (!key) return Promise.resolve(true);
  if (shardProgress.shards[key] === "ready") return Promise.resolve(true);
  const pending = pendingShards.get(key);
  if (pending) return pending;
  shardProgress.shards[key] = "loading";
  const job = fetchJson<TextShardPayload>(dataset.assetUrl("textShard", { lang: sourceLang, key }))
    .then((shard) => {
      if (pack) {
        for (const [id, rows] of Object.entries(shard.scripts ?? {})) {
          pack.scripts[id] = rows as BeatRow[];
        }
      }
      shardProgress.shards[key] = "ready";
      pendingShards.delete(key);
      return true;
    })
    .catch((error: unknown) => {
      shardProgress.shards[key] = "failed";
      shardProgress.shardError = error instanceof Error ? error.message : String(error);
      pendingShards.delete(key);
      return false;
    });
  pendingShards.set(key, job);
  return job;
};

const hasScript = (id: string): boolean => {
  const rows = sourceBeatRows();
  return !!rows && Object.prototype.hasOwnProperty.call(rows, id);
};

const ensureScript = (lang: string, id: string): Promise<boolean> =>
  ensureHead(lang)
    .then(() => {
      if (hasScript(id)) return true;
      const key = graphMeta.shardByNode[id];
      if (!key) return false;
      return ensureShard(lang, key).then(() => hasScript(id));
    })
    .catch(() => false);

const beatRows = (lang: string, id: string): BeatRow[] | null => {
  const rows = sourceBeatRows();
  if (!rows) return null;
  const found = rows[id];
  if (found === undefined) return null;
  if (!hasConverted(lang)) return found;
  const cache = cacheOf(lang);
  const hit = cache.beatRowsById[id];
  if (hit !== undefined) return hit;
  const next = convert.beatRows(lang, found) || [];
  cache.beatRowsById[id] = next;
  return next;
};

type TableKey = "characters" | "titles" | "edgeLabels";

const tableOf = (lang: string, key: TableKey): TextTable => {
  const raw = sourcePack();
  if (!raw) return {};
  const value = raw[key] || {};
  if (!hasConverted(lang)) return value;
  const cache = cacheOf(lang);
  const cached = cache[key];
  if (cached) return cached;
  const next = convert.tree(lang, value);
  cache[key] = next;
  return next;
};

const characters = (lang: string): TextTable => tableOf(lang, "characters");

const titles = (lang: string): TextTable => tableOf(lang, "titles");

const edgeLabels = (lang: string): TextTable => tableOf(lang, "edgeLabels");

const names = (lang: string): NameTable => {
  const raw = sourcePack();
  if (!raw) return {};
  const value = raw.names || {};
  if (!hasConverted(lang)) return value;
  const cache = cacheOf(lang);
  if (cache.names) return cache.names;
  cache.names = convert.tree(lang, value);
  return cache.names;
};

const edgeLabel = (lang: string, edgeIndex: string, fallback: string): string =>
  edgeLabels(lang)[edgeIndex] || fallback || "";

const textPackOf = (lang: string): TextPack | null => {
  const raw = sourcePack();
  if (!raw) return null;
  if (!hasConverted(lang)) return raw;
  const cache = cacheOf(lang);
  if (!cache.pack) {
    cache.pack = {
      schema: raw.schema,
      lang,
      missingKeyCount: raw.missingKeyCount,
      missingKeys: raw.missingKeys || [],
      shardKeys: raw.shardKeys || [],
      characters: {},
      titles: {},
      names: {},
      edgeLabels: {},
      scripts: cache.beatRowsById,
    };
  }
  const converted = cache.pack;
  converted.characters = characters(lang);
  converted.titles = titles(lang);
  converted.names = names(lang);
  converted.edgeLabels = edgeLabels(lang);
  const rows = raw.scripts || {};
  for (const id of Object.keys(rows)) {
    if (cache.beatRowsById[id] === undefined) {
      cache.beatRowsById[id] = convert.beatRows(lang, rows[id]) || [];
    }
  }
  return converted;
};

const progress = (): TextProgress => {
  const total = shardKeys.length;
  let loaded = 0;
  let failed = 0;
  for (const key of shardKeys) {
    const state = shardProgress.shards[key];
    if (state === "ready") loaded++;
    else if (state === "failed") failed++;
  }
  return {
    headState: shardProgress.headState,
    loaded,
    total,
    done: shardProgress.headState === "ready" && (total === 0 || loaded + failed >= total),
    headError: shardProgress.headError || "",
    shardError: shardProgress.shardError || "",
  };
};

const settleShard = (lang: string, key: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (shardProgress.shards[key] === "loading") {
        shardProgress.shards[key] = "failed";
        shardProgress.shardError = `timeout: ${key}`;
        pendingShards.delete(key);
      }
      resolve(false);
    }, SHARD_TIMEOUT);
    ensureShard(lang, key).then(
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });

const ensureAll = (
  lang: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<boolean> =>
  ensureHead(lang).then(async () => {
    for (let index = 0; index < shardKeys.length; index++) {
      await settleShard(lang, shardKeys[index]);
      if (onProgress) onProgress(index + 1, shardKeys.length);
    }
    return true;
  });

const shardState = (id: string): ShardState => {
  const key = graphMeta.shardByNode[id];
  if (!key) return "missing";
  return shardProgress.shards[key] || "idle";
};

const retry = (lang: string, id: string): Promise<boolean> => {
  const key = graphMeta.shardByNode[id];
  if (key && shardProgress.shards[key] === "failed") delete shardProgress.shards[key];
  return ensureScript(lang, id);
};

export const textStore = {
  characters,
  edgeLabel,
  ensureAll,
  ensureHead,
  ensureScript,
  names,
  pack: textPackOf,
  progress,
  retry,
  shardState,
  beatRows,
  titles,
};
