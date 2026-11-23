import { wordCount } from "../data/wordcount";
import { popovers } from "../lib/popover";
import { statsFilteredTotal, statsTableRows } from "../lib/stats";
import type { WordPack } from "../types/text";
import { UI_IDS } from "../ui/ids";

const KIND_LABEL_KEYS: Record<string, string> = {
  dialog: "typeDialog",
  narration: "typeNarration",
  think: "typeThink",
  option: "typeOption",
  lore: "typeLore",
};

export const useStatsPanel = () => {
  const store = useScriptStore();

  const reloadTick = ref(0);
  const loading = ref(false);
  const activeKind = ref("all");
  const openChapter = ref("");

  const open = computed(() => popovers.isOpen("stats"));

  const wordPack = computed<WordPack | null>(() => {
    void reloadTick.value;
    return wordCount.pack();
  });

  const totals = computed(() => statsFilteredTotal(wordPack.value, activeKind.value));

  const kindItems = computed(() => {
    const items = [{ id: "all", key: "statsKindAll" }];
    for (const kind of wordCount.kinds()) {
      items.push({ id: kind, key: KIND_LABEL_KEYS[kind] || "statsKindAll" });
    }
    return items;
  });

  const tableRows = computed(() =>
    statsTableRows(wordPack.value, activeKind.value, openChapter.value),
  );

  const close = () => popovers.close("stats");

  const pickKind = (id: string) => {
    if (activeKind.value === id) return;
    activeKind.value = id;
  };

  const toggleChapter = (id: string) => {
    openChapter.value = openChapter.value === id ? "" : id;
  };

  const openScript = (id: string) => {
    store.select(id);
  };

  const load = () => {
    loading.value = true;
    void wordCount.load().then(() => {
      loading.value = false;
      reloadTick.value++;
    });
  };

  watch(open, (value) => {
    if (!value) return;
    openChapter.value = "";
    load();
  });

  onMounted(() => {
    popovers.register("stats", {
      id: UI_IDS.statsPanel,
      triggerId: UI_IDS.statsBtn,
      group: "modal",
      autofocus: UI_IDS.statsClose,
    });
  });

  return {
    open,
    loading,
    activeKind,
    wordPack,
    totals,
    kindItems,
    tableRows,
    close,
    pickKind,
    toggleChapter,
    openScript,
  };
};
