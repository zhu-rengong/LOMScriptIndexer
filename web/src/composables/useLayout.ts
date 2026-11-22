import { popovers } from "../lib/popover";
import { OVERLAY_KEYS } from "../ui/ids";

export const useLayout = (): void => {
  const view = useViewStore(pinia);

  watch(
    () => [view.sheetMode, view.overlayRail] as const,
    () => {
      for (const key of OVERLAY_KEYS) popovers.close(key);
    },
  );
};
