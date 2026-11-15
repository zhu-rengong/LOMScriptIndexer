import { useBreakpoints } from "@vueuse/core";
import { overlay } from "../lib/overlay";
import { pinia } from "../stores";
import { useViewStore } from "../stores/view";

export type LayoutName = "wide" | "mid" | "narrow" | "compact" | "mobile";

const BREAKPOINTS = { wide: 1440, mid: 1200, narrow: 1024, compact: 768 };

export const useLayout = (onChange?: () => void): void => {
  const view = useViewStore(pinia);
  const active = useBreakpoints(BREAKPOINTS).active();

  const applyLayout = (next: LayoutName): void => {
    if (next === view.layout && document.body.dataset.layout === next) return;
    view.setLayout(next);
    document.body.dataset.layout = next;
    if (!view.isOverlayRail()) overlay.close("chapterRail");
    overlay.close("moreMenu");
    overlay.close("langMenu");
    overlay.close("navMenu");
    if (onChange) onChange();
  };

  watch(active, () => applyLayout((active.value || "mobile") as LayoutName), { immediate: true });
};
