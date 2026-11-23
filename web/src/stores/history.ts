import { replaceScript } from "../router";
import type { ReadingAnchor } from "./script";

export type HistorySpot = { id: string; anchor: ReadingAnchor | null };

export const useHistoryStore = defineStore("history", () => {
  const script = useScriptStore(pinia);
  const spots = ref<HistorySpot[]>([]);
  const cursor = ref(-1);
  const pendingSpot = shallowRef<HistorySpot | null>(null);

  let capture: (() => ReadingAnchor | null) | null = null;
  let stepping = "";

  const bindCapture = (fn: (() => ReadingAnchor | null) | null): void => {
    capture = fn;
  };

  const settle = (): void => {
    const spot = spots.value[cursor.value];
    if (!spot || !capture) return;
    const anchor = capture();
    if (anchor) spot.anchor = anchor;
  };

  const remember = (id: string, anchor: ReadingAnchor): void => {
    const spot = spots.value[cursor.value];
    if (!spot || spot.id !== id) return;
    spot.anchor = anchor;
  };

  const record = (id: string, force = false): void => {
    if (!id) return;
    pendingSpot.value = null;
    const spot = spots.value[cursor.value];
    if (!force && spot?.id === id) return;
    const next = spots.value.slice(0, cursor.value + 1);
    next.push({ id, anchor: null });
    spots.value = next;
    cursor.value = next.length - 1;
  };

  const takeSpot = (id: string): HistorySpot | null => {
    const spot = pendingSpot.value;
    if (!spot || spot.id !== id) return null;
    pendingSpot.value = null;
    return spot;
  };

  const go = (index: number): boolean => {
    const spot = spots.value[index];
    if (!spot) return false;
    settle();
    cursor.value = index;
    pendingSpot.value = { id: spot.id, anchor: spot.anchor };
    if (spot.id === script.selectedId) return true;
    const target = spot.id;
    stepping = target;
    void replaceScript(target).then(async () => {
      await nextTick();
      if (stepping === target) stepping = "";
    });
    return true;
  };

  const canBack = computed(() => cursor.value > 0);

  const canForward = computed(() => cursor.value >= 0 && cursor.value < spots.value.length - 1);

  const back = (): boolean => (canBack.value ? go(cursor.value - 1) : false);

  const forward = (): boolean => (canForward.value ? go(cursor.value + 1) : false);

  watch(
    () => script.selectedId,
    (id) => {
      if (!id) return;
      if (stepping === id) {
        stepping = "";
        return;
      }
      record(id);
    },
    { flush: "post", immediate: true },
  );

  return {
    spots,
    cursor,
    pendingSpot,
    bindCapture,
    settle,
    remember,
    record,
    takeSpot,
    canBack,
    canForward,
    back,
    forward,
  };
});
