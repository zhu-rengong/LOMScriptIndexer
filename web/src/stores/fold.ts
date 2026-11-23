export type FoldState = "none" | "collapsed" | "mixed" | "expanded";

export const useFoldStore = defineStore("fold", () => {
  const script = useScriptStore(pinia);
  const states = reactive(new Map<string, boolean>());
  const registered = reactive(new Set<string>());

  const scoped = (key: string): string => `${script.selectedId}:${key}`;

  const isOpen = (key: string): boolean => (key ? (states.get(scoped(key)) ?? false) : false);

  const setOpen = (key: string, open: boolean): void => {
    if (!key) return;
    states.set(scoped(key), open);
  };

  const register = (key: string): void => {
    if (!key) return;
    const id = scoped(key);
    registered.add(id);
    if (!states.has(id)) states.set(id, false);
  };

  const unregister = (key: string): void => {
    if (!key) return;
    registered.delete(scoped(key));
  };

  const total = computed(() => registered.size);

  const openCount = computed(() => {
    let count = 0;
    for (const key of registered) if (states.get(key)) count += 1;
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
    for (const key of registered) states.set(key, true);
  };

  const closeAll = (): void => {
    for (const key of registered) states.set(key, false);
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
    isOpen,
    setOpen,
    register,
    unregister,
    openAll,
    closeAll,
    toggle,
  };
});
