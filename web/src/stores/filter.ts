import { textStore } from "../data/text";
import { filterErrorText, FilterIndex } from "../lib/filterIndex";
import { query } from "../lib/query";

export const useFilterStore = defineStore("filter", () => {
  const script = useScriptStore(pinia);
  const index = new FilterIndex();
  const source = ref("");
  const matches = shallowRef<Set<number> | null>(null);
  const error = ref("");
  const loading = ref(false);
  let token = 0;

  const reset = (): void => {
    token++;
    source.value = "";
    matches.value = null;
    error.value = "";
    loading.value = false;
    index.reset();
  };

  const apply = (value: string): void => {
    const next = value || "";
    if (!next.trim()) {
      reset();
      return;
    }
    const seq = ++token;
    const needsText = query.needsText(next) && !textStore.progress().done;
    const result = index.compile(next);
    if (!result.ok) {
      source.value = next;
      matches.value = null;
      error.value = filterErrorText(result.error);
      loading.value = false;
      return;
    }
    source.value = next;
    matches.value = result.set;
    error.value = "";
    loading.value = needsText;
    if (!needsText) return;
    void textStore.ensureAll(script.textLang()).then(() => {
      if (seq !== token) return;
      index.reset();
      const later = index.compile(next);
      if (seq !== token) return;
      matches.value = later.ok ? later.set : null;
      error.value = later.ok ? "" : filterErrorText(later.error);
      loading.value = false;
    });
  };

  const refresh = (): void => {
    const value = source.value;
    index.reset();
    if (value.trim()) apply(value);
    else reset();
  };

  return {
    source,
    matches,
    error,
    loading,
    apply,
    reset,
    refresh,
    queryIndex: () => index.build(),
  };
});
