import { byId } from "../lib/dom";
import { popovers } from "../lib/popover";
import { keys, storedRef } from "../lib/storage";
import { overlayRail, sheetMode } from "../lib/viewport";
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
  const railTab = ref("outline");
  const outlineChapter = ref<number | undefined>(undefined);
  const fontTarget = ref<FontTarget>({ scope: "slot", id: "dialog" });
  const pickerTarget = ref<FontTarget>({ scope: "slot", id: "dialog" });
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

  const railOpen = computed(() => popovers.isOpen(CHAPTER_RAIL));

  const searchOpen = computed(
    () =>
      popovers.isOpen("search") ||
      popovers.isOpen("searchResults") ||
      popovers.isOpen("filterPopover"),
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
    chromeHidden.value = false;
    if (popovers.isOpen("search")) popovers.close("search");
  });

  const showChrome = (): void => {
    if (!chromeHidden.value) return;
    chromeHidden.value = false;
  };

  const toggleChrome = (): void => {
    if (!sheetMode.value) return;
    if (popovers.anyOpen()) return;
    chromeHidden.value = !chromeHidden.value;
  };

  const openSearch = (): void => {
    showChrome();
    if (!sheetMode.value) {
      void nextTick(() => byId(UI_IDS.search)?.focus());
      return;
    }
    popovers.open("search");
  };

  watch(
    () => popovers.isOpen("search"),
    (open) => {
      if (!open) return;
      void nextTick(() => byId(UI_IDS.search)?.focus());
    },
  );

  const collapseSearch = (): void => {
    if (popovers.isOpen("filterPopover")) {
      popovers.close("filterPopover");
      return;
    }
    if (popovers.isOpen("search")) {
      popovers.close("search");
      return;
    }
    if (popovers.isOpen("searchResults")) popovers.close("searchResults");
  };

  const openRail = (): void => {
    if (!overlayRail.value) return;
    popovers.open(CHAPTER_RAIL, { trigger: byId(UI_IDS.railToggle) });
    showChrome();
  };

  const closeRail = (): void => {
    if (popovers.isOpen(CHAPTER_RAIL)) popovers.close(CHAPTER_RAIL);
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
    toggleChrome,
    openSearch,
    collapseSearch,
    openRail,
    closeRail,
    toggleRail,
    toggleInfer,
    toggleKind,
    toggleReveal,
    switchLang,
  };
});
