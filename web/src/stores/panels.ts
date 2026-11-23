import { popovers } from "../lib/popover";

export type FocusTarget = { kind: string; key: string };

export type PendingHit = { id: string; query: string; target: FocusTarget | null };

export const usePanelsStore = defineStore("panels", () => {
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
    const needle = String(query ?? "")
      .trim()
      .toLowerCase();
    pendingHit.value =
      id && (needle || target) ? { id, query: needle, target: target || null } : null;
  };

  const takePendingHit = (id: string): PendingHit | null => {
    const hit = pendingHit.value;
    if (!hit) return null;
    pendingHit.value = null;
    return hit.id === id ? hit : null;
  };

  return {
    pendingHit,
    openLookup,
    focusText,
    takePendingHit,
  };
});
