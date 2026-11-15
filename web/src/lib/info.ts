import { byId } from "./browser";
import { overlay } from "./overlay";
import { useUiStore, type InfoTab } from "../stores/ui";

export const openInfo = (tab: InfoTab, triggerId: string): void => {
  const ui = useUiStore();
  const wasOpen = overlay.isOpen("info");
  const sameTab = ui.infoTab === tab;
  ui.setInfoTab(tab);
  overlay.close("moreMenu");
  if (wasOpen && sameTab) {
    overlay.close("info");
    return;
  }
  if (!wasOpen) overlay.open("info", { trigger: byId(triggerId) });
};
