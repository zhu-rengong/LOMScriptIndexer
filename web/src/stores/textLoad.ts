import type { ShardState, TextProgress } from "../types/text";

export const useTextLoadStore = defineStore("textLoad", () => {
  const headState = ref<ShardState>("idle");
  const shards = reactive<Record<string, ShardState>>({});
  const headError = ref("");
  const shardError = ref("");

  const setHead = (state: ShardState, error = ""): void => {
    headState.value = state;
    headError.value = state === "failed" ? error : "";
  };

  const setShard = (key: string, state: ShardState, error = ""): void => {
    if (!key) return;
    shards[key] = state;
    if (error) shardError.value = error;
  };

  const clearShard = (key: string): void => {
    delete shards[key];
  };

  const shardOf = (key: string): ShardState => (key ? shards[key] || "idle" : "missing");

  const progress = (keys: string[]): TextProgress => {
    let loaded = 0;
    let failed = 0;
    for (const key of keys) {
      const state = shards[key];
      if (state === "ready") loaded++;
      else if (state === "failed") failed++;
    }
    return {
      headState: headState.value,
      loaded,
      total: keys.length,
      done: headState.value === "ready" && (keys.length === 0 || loaded + failed >= keys.length),
      headError: headError.value || "",
      shardError: shardError.value || "",
    };
  };

  return {
    headState,
    shards,
    headError,
    shardError,
    setHead,
    setShard,
    clearShard,
    shardOf,
    progress,
  };
});
