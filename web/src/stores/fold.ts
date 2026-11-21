import { useScriptStore } from "./script";

export type FoldState = "none" | "collapsed" | "mixed" | "expanded";

export const useFoldStore = defineStore("fold", () => {
  const items = new Map<string, Ref<boolean>>();
  const states = new Map<string, boolean>();
  const revision = ref(0);

  const scoped = (key: string): string => `${useScriptStore(pinia).selectedId}:${key}`;

  const register = (id: string, open: Ref<boolean>): void => {
    items.set(id, open);
    revision.value++;
  };

  const unregister = (id: string): void => {
    if (!items.delete(id)) return;
    revision.value++;
  };

  const recall = (key: string): boolean | undefined => states.get(scoped(key));

  const remember = (key: string, open: boolean): void => {
    states.set(scoped(key), open);
  };

  const total = computed(() => {
    void revision.value;
    return items.size;
  });

  const openCount = computed(() => {
    void revision.value;
    let count = 0;
    for (const open of items.values()) if (open.value) count += 1;
    return count;
  });

  const state = computed<FoldState>(() => {
    const size = total.value;
    if (!size) return "none";
    const opened = openCount.value;
    if (!opened) return "collapsed";
    if (opened === size) return "expanded";
    return "mixed";
  });

  const openAll = (): void => {
    for (const open of items.values()) open.value = true;
  };

  const closeAll = (): void => {
    for (const open of items.values()) open.value = false;
  };

  const toggle = (): void => {
    const current = state.value;
    if (current === "none") return;
    if (current === "collapsed") {
      openAll();
      return;
    }
    if (current === "mixed" && openCount.value * 2 <= total.value) {
      openAll();
      return;
    }
    closeAll();
  };

  return {
    total,
    openCount,
    state,
    register,
    unregister,
    recall,
    remember,
    openAll,
    closeAll,
    toggle,
  };
});
