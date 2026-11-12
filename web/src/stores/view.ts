import { defineStore } from "pinia";
import { dataset } from "../data/dataset";
import { textStore } from "../data/text";
import { byId } from "../lib/browser";
import { applyFilter, resetFilterContext } from "../lib/filter";
import { lang } from "../lib/lang";
import { overlay } from "../lib/overlay";
import { searchIndex } from "../lib/search";
import { keys, readJson, writeJson } from "../lib/storage";
import type { ReaderVisibleKind, ReaderVisibility } from "../types/beats";
import type { FontTarget } from "../types/font";
import { UI_IDS } from "../ui/ids";
import { pinia } from "./index";
import { usePanelsStore } from "./panels";
import { useScriptStore } from "./script";

const CHAPTER_RAIL = "chapterRail";

const storedInfer = readJson<boolean>(keys.infer);

export const useViewStore = defineStore("view", () => {
  const layout = ref("wide");
  const railTab = ref("outline");
  const outlineChapter = ref<number | undefined>(undefined);
  const fontTarget = ref<FontTarget>({ scope: "slot", id: "dialog" });
  const railOpen = ref(false);
  const inferEnabled = ref(storedInfer === null ? true : storedInfer === true);
  const revealOn = ref(false);
  const visibleKinds = ref<ReaderVisibility>({
    dialog: true,
    think: true,
    narration: true,
    lore: true,
  });

  const filtering = computed(
    () =>
      !visibleKinds.value.dialog ||
      !visibleKinds.value.think ||
      !visibleKinds.value.narration ||
      !visibleKinds.value.lore,
  );

  const isOverlayRail = (): boolean => layout.value === "compact" || layout.value === "mobile";

  const setLayout = (next: string): void => {
    if (!next || next === layout.value) return;
    layout.value = next;
  };

  const setRailTab = (tab: string): void => {
    if (tab === railTab.value) return;
    railTab.value = tab;
  };

  const setOutlineChapter = (value: number | undefined): void => {
    outlineChapter.value = value;
  };

  const setFontTarget = (target: FontTarget): void => {
    fontTarget.value = target;
  };

  watchEffect(() => {
    document.body.classList.toggle("rail-open", railOpen.value);
  });

  const hideRail = (): void => {
    railOpen.value = false;
  };

  const openRail = (): void => {
    if (!isOverlayRail()) return;
    railOpen.value = true;
    overlay.open(CHAPTER_RAIL, { trigger: byId(UI_IDS.railToggle) });
  };

  const closeRail = (): void => {
    if (overlay.isOpen(CHAPTER_RAIL)) overlay.close(CHAPTER_RAIL);
    else hideRail();
  };

  const toggleRail = (): void => {
    if (railOpen.value) closeRail();
    else openRail();
  };

  const toggleInfer = (): void => {
    inferEnabled.value = !inferEnabled.value;
    writeJson(keys.infer, inferEnabled.value);
  };

  const toggleKind = (kind: ReaderVisibleKind): void => {
    visibleKinds.value = { ...visibleKinds.value, [kind]: !visibleKinds.value[kind] };
  };

  const toggleReveal = (): void => {
    revealOn.value = !revealOn.value;
  };

  let langToken = 0;

  const switchLang = async (id: string): Promise<void> => {
    if (!id) return;
    const script = useScriptStore(pinia);
    const panels = usePanelsStore(pinia);
    const token = ++langToken;
    const content = dataset.meta.langs.indexOf(id) >= 0 ? id : script.textLang();
    const ok = await textStore.ensureHead(content);
    if (token !== langToken || !ok) return;
    if (!script.setLang(id)) return;
    lang.applyDocument(id);
    panels.hideLookup();
    searchIndex.invalidate();
    resetFilterContext();
    if (script.filterSource.trim()) applyFilter(script.filterSource);
  };

  return {
    layout,
    railTab,
    outlineChapter,
    fontTarget,
    railOpen,
    inferEnabled,
    revealOn,
    visibleKinds,
    filtering,
    isOverlayRail,
    setLayout,
    setRailTab,
    setOutlineChapter,
    setFontTarget,
    hideRail,
    openRail,
    closeRail,
    toggleRail,
    toggleInfer,
    toggleKind,
    toggleReveal,
    switchLang,
  };
});
