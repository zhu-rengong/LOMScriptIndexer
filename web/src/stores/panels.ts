import { popovers } from "../lib/popover";
import { toNeedle } from "../lib/strings";
import type { FocusTarget } from "../types/focus";

export type PendingHit = { id: string; query: string; target: FocusTarget | null };

export const usePanelsStore = defineStore("panels", () => {
  const script = useScriptStore(pinia);
  const history = useHistoryStore(pinia);
  const pendingHit = shallowRef<PendingHit | null>(null);

  const openLookup = (
    kind: string,
    key: string,
    trigger?: HTMLElement | null,
    method?: string,
  ): void => {
    if (!key) return;
    popovers.open("lookup", { trigger: trigger || null, payload: { kind, key, method } });
  };

  const focusText = (id: string, query: string, target?: FocusTarget | null): void => {
    const needle = toNeedle(query);
    const hit = id && (needle || target) ? { id, query: needle, target: target || null } : null;
    if (hit && id === script.selectedId) {
      history.settle();
      history.record(id, true);
    }
    pendingHit.value = hit;
  };

  const takePendingHit = (id: string): PendingHit | null => {
    const hit = pendingHit.value;
    if (!hit || hit.id !== id) return null;
    pendingHit.value = null;
    return hit;
  };

  return {
    pendingHit,
    openLookup,
    focusText,
    takePendingHit,
  };
});
