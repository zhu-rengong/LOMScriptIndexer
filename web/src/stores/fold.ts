export type FoldState = "none" | "collapsed" | "mixed" | "expanded";

export const useFoldStore = defineStore("fold", () => {
  const script = useScriptStore(pinia);
  const states = reactive(new Map<string, boolean>());
  const registered = reactive(new Set<string>());
  const keys = reactive(new Map<string, string>());

  const prefix = (): string => `${script.selectedId}:`;

  const scoped = (key: string): string => `${prefix()}${key}`;

  const isOpen = (key: string): boolean => (key ? (states.get(scoped(key)) ?? false) : false);

  const setOpen = (key: string, open: boolean): void => {
    if (!key) return;
    states.set(scoped(key), open);
  };

  const register = (key: string): string => {
    if (!key) return "";
    const id = scoped(key);
    keys.set(id, key);
    registered.add(id);
    if (!states.has(id)) states.set(id, false);
    return id;
  };

  const unregister = (id: string): void => {
    if (!id) return;
    registered.delete(id);
    keys.delete(id);
  };

  const currentIds = (): string[] => {
    const start = prefix();
    const out: string[] = [];
    for (const id of registered) if (id.startsWith(start)) out.push(id);
    return out;
  };

  const visibleIds = (): string[] => {
    const out: string[] = [];
    for (const id of currentIds()) {
      const key = keys.get(id);
      if (!key) continue;
      const parts = key.split("/");
      let visible = true;
      for (let index = 1; index < parts.length; index++) {
        const ancestor = scoped(parts.slice(0, index).join("/"));
        if (registered.has(ancestor) && !states.get(ancestor)) {
          visible = false;
          break;
        }
      }
      if (visible) out.push(id);
    }
    return out;
  };

  const total = computed(() => visibleIds().length);

  const openCount = computed(() => {
    let count = 0;
    for (const id of visibleIds()) if (states.get(id)) count += 1;
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

  const openPath = (path: string): void => {
    if (!path) return;
    const parts = path.split("/");
    for (let index = 1; index <= parts.length; index++) {
      const id = scoped(parts.slice(0, index).join("/"));
      if (registered.has(id)) states.set(id, true);
    }
  };

  const openAll = (): void => {
    for (const id of currentIds()) states.set(id, true);
  };

  const closeAll = (): void => {
    for (const id of currentIds()) states.set(id, false);
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
    openPath,
    openAll,
    closeAll,
    toggle,
  };
});
