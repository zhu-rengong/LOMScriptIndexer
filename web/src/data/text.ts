import type { TextShardPayload, TextHeadPayload } from "../types/generated";
import type { BeatRow } from "../types/beats";
import type { Dataset } from "../types/graph";
import type { ShardState, TextPack, TextProgress } from "../types/text";
import { t } from "../i18n";
import { readDataset } from "./access";
import { convert } from "./convert";
import { TextHeadSchema, fetchJson, fetchValidated } from "./load";

let uiHandle: ReturnType<typeof useUiStore> | null = null;

const ui = (): ReturnType<typeof useUiStore> => (uiHandle ??= useUiStore(pinia));

const textLoad = (): ReturnType<typeof useTextLoadStore> => useTextLoadStore(pinia);

const SHARD_TIMEOUT = 30000;

const meta = (): Dataset["meta"] => readDataset().meta;

const sourceLang = (): string => {
  const info = meta();
  return info.sourceLang || info.langs[0] || "";
};

const shardKeys = (): string[] => meta().shards.map((shard) => shard.key);

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

const scriptIds = (): string[] => {
  const rows = sourceBeatRows();
  return rows ? Object.keys(rows) : [];
};

const scriptCount = (): number => scriptIds().length;

const hasConverted = (lang: string): boolean => lang !== sourceLang() && convert.hasConverter(lang);

const ensureConvert = (lang: string): Promise<boolean> => {
  if (lang === sourceLang()) return Promise.resolve(true);
  if (convert.hasConverter(lang)) return Promise.resolve(true);
  return convert.ensureConverter(lang);
};

const loadHead = (): Promise<boolean> => {
  const state = textLoad();
  state.setHead("loading");
  headPromise = fetchValidated<TextHeadPayload>(
    readDataset().assetUrl("textHead", { lang: sourceLang() }),
    TextHeadSchema,
    "text head",
  )
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
      state.setHead("ready");
      return true;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      state.setHead("failed", message);
      ui().toast(t("langFailed", { lang: sourceLang() }));
      return false;
    });
  return headPromise;
};

const ensureHead = (lang: string): Promise<boolean> => {
  const state = textLoad();
  const current =
    state.headState === "ready"
      ? Promise.resolve(true)
      : state.headState === "loading" && headPromise
        ? headPromise
        : loadHead();
  return Promise.all([current, ensureConvert(lang)]).then(([headOk, convertedOk]) => {
    if (!headOk) return false;
    if (!convertedOk && lang !== sourceLang()) {
      ui().toast(t("langFailed", { lang }));
      return false;
    }
    return true;
  });
};

const ensureShard = (lang: string, key: string): Promise<boolean> => {
  if (!key) return Promise.resolve(true);
  const state = textLoad();
  if (state.shardOf(key) === "ready") return Promise.resolve(true);
  const pending = pendingShards.get(key);
  if (pending) return pending;
  state.setShard(key, "loading");
  const job = fetchJson<TextShardPayload>(
    readDataset().assetUrl("textShard", { lang: sourceLang(), key }),
  )
    .then((shard) => {
      if (pack) {
        for (const [id, rows] of Object.entries(shard.scripts ?? {})) {
          pack.scripts[id] = rows as BeatRow[];
        }
      }
      state.setShard(key, "ready");
      pendingShards.delete(key);
      return true;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      state.setShard(key, "failed", message);
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
      const key = meta().shardByNode[id];
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

const progress = (): TextProgress => textLoad().progress(shardKeys());

const settleShard = (lang: string, key: string): Promise<boolean> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      const state = textLoad();
      if (state.shardOf(key) === "loading") {
        state.setShard(key, "failed", `timeout: ${key}`);
        pendingShards.delete(key);
      }
      resolve(false);
    }, SHARD_TIMEOUT);
    ensureShard(lang, key).then(
      (ok) => {
        clearTimeout(timer);
        resolve(ok);
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });

const ensureAll = async (
  lang: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<boolean> => {
  const headOk = await ensureHead(lang);
  if (!headOk) return false;
  const keys = shardKeys();
  const failed: string[] = [];
  for (let index = 0; index < keys.length; index++) {
    const ok = await settleShard(lang, keys[index]);
    if (!ok) failed.push(keys[index]);
    if (onProgress) onProgress(index + 1, keys.length);
  }
  for (const key of failed) await settleShard(lang, key);
  return keys.every((key) => textLoad().shardOf(key) === "ready");
};

const shardState = (id: string): ShardState => {
  const key = meta().shardByNode[id];
  if (!key) return "missing";
  return textLoad().shardOf(key);
};

const retry = (lang: string, id: string): Promise<boolean> => {
  const key = meta().shardByNode[id];
  if (key && textLoad().shardOf(key) === "failed") textLoad().clearShard(key);
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
  scriptCount,
  scriptIds,
  shardState,
  beatRows,
  titles,
};
