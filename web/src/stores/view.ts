import { useMediaQuery } from "@vueuse/core";
import { byId } from "../lib/browser";
import { popovers } from "../lib/popover";
import { keys, storedRef } from "../lib/storage";
import type { ReaderVisibleKind, ReaderVisibility } from "../types/beats";
import type { FontTarget } from "../types/font";
import { UI_IDS } from "../ui/ids";
import { useLanguageStore } from "./language";

const CHAPTER_RAIL = "chapterRail";

const flagStored = (key: string) =>
  storedRef<boolean>(key, true, {
    decode: (raw, base) => (typeof raw === "boolean" ? raw : base),
  });

export const useViewStore = defineStore("view", () => {
  const sheetMode = useMediaQuery("(max-width: 767px)");
  const overlayRail = useMediaQuery("(max-width: 1023px)");
  const railTab = ref("outline");
  const outlineChapter = ref<number | undefined>(undefined);
  const fontTarget = ref<FontTarget>({ scope: "slot", id: "dialog" });
  const pickerTarget = ref<FontTarget>({ scope: "slot", id: "dialog" });
  const railOpen = ref(false);
  const searchOpen = ref(false);
  const chromeHidden = ref(false);
  const inferEnabled = flagStored(keys.infer);
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

  const setPickerTarget = (target: FontTarget): void => {
    pickerTarget.value = target;
  };

  watchEffect(() => {
    document.body.classList.toggle("rail-open", railOpen.value);
    document.body.classList.toggle("search-open", searchOpen.value);
    document.body.classList.toggle("chrome-hidden", chromeHidden.value);
  });

  watch(sheetMode, (sheet) => {
    if (sheet) return;
    searchOpen.value = false;
    chromeHidden.value = false;
  });

  const showChrome = (): void => {
    if (!chromeHidden.value) return;
    chromeHidden.value = false;
  };

  const hideChrome = (): void => {
    if (chromeHidden.value) return;
    if (!sheetMode.value || searchOpen.value || railOpen.value) return;
    if (popovers.anyOpen()) return;
    chromeHidden.value = true;
  };

  const openSearch = (): void => {
    searchOpen.value = true;
    showChrome();
  };

  const collapseSearch = (): void => {
    searchOpen.value = false;
  };

  const hideRail = (): void => {
    railOpen.value = false;
  };

  const openRail = (): void => {
    if (!overlayRail.value) return;
    searchOpen.value = false;
    railOpen.value = true;
    showChrome();
    popovers.open(CHAPTER_RAIL, { trigger: byId(UI_IDS.railToggle) });
  };

  const closeRail = (): void => {
    if (popovers.isOpen(CHAPTER_RAIL)) popovers.close(CHAPTER_RAIL);
    else hideRail();
  };

  const toggleRail = (): void => {
    if (railOpen.value) closeRail();
    else openRail();
  };

  const toggleInfer = (): void => {
    inferEnabled.value = !inferEnabled.value;
  };

  const toggleKind = (kind: ReaderVisibleKind): void => {
    visibleKinds.value = { ...visibleKinds.value, [kind]: !visibleKinds.value[kind] };
  };

  const toggleReveal = (): void => {
    revealOn.value = !revealOn.value;
  };

  const switchLang = (id: string): Promise<void> => useLanguageStore(pinia).switchTo(id);

  return {
    sheetMode,
    overlayRail,
    railTab,
    outlineChapter,
    fontTarget,
    pickerTarget,
    railOpen,
    searchOpen,
    chromeHidden,
    inferEnabled,
    revealOn,
    visibleKinds,
    filtering,
    setRailTab,
    setOutlineChapter,
    setFontTarget,
    setPickerTarget,
    showChrome,
    hideChrome,
    openSearch,
    collapseSearch,
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
