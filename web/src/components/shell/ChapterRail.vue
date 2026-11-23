<script setup lang="ts">
import { useMediaQuery, useMutationObserver } from "@vueuse/core";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { graph } from "../../data/graph";
import { specialScripts } from "../../data/special";
import { t } from "../../i18n";
import { toNeedle } from "../../lib/strings";
import { bookmarkRows, outlineRows, specialRows, type RailRow } from "../../lib/rail";

type RailTab = "outline" | "bookmarks" | "special";

const TAB_IDS: RailTab[] = ["outline", "bookmarks", "special"];
const TAB_LABEL_KEYS: Record<RailTab, string> = {
  outline: "railTabOutline",
  bookmarks: "railTabBookmarks",
  special: "railTabSpecial",
};

const store = useScriptStore();
const view = useViewStore();
const ui = useUiStore();

const query = ref("");
const listRef = ref<HTMLElement | null>(null);
const tablistRef = ref<HTMLElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);

const searching = computed(() => toNeedle(query.value).length > 0);

const openChapter = computed(() => {
  const explicit = view.outlineChapter;
  if (explicit !== undefined) return explicit;
  const node = store.selected();
  return node ? node.chapterIndex : -1;
});

const outline = computed(() => outlineRows(query.value, openChapter.value));
const rows = computed(() => outline.value.rows);

const rowSize = reactive({ chapter: 44, node: 32 });

const virtualizer = useVirtualizer(
  computed(() => ({
    count: rows.value.length,
    getScrollElement: () => listRef.value,
    estimateSize: (index: number) =>
      rows.value[index]?.kind === "chapter" ? rowSize.chapter : rowSize.node,
    overscan: 12,
    getItemKey: (index: number) => rows.value[index]?.key ?? index,
  })),
);

const visible = computed(() =>
  virtualizer.value.getVirtualItems().map((item) => ({
    row: rows.value[item.index] as RailRow,
    top: item.start,
    index: item.index,
  })),
);

const totalHeight = computed(() => virtualizer.value.getTotalSize());

const measureElement = (element: Element | null): void => {
  if (element) virtualizer.value.measureElement(element);
};

const coarse = useMediaQuery("(pointer: coarse)");

watch(coarse, () => virtualizer.value.measure());

useMutationObserver(
  () => document.documentElement,
  () => virtualizer.value.measure(),
  { attributes: true, attributeFilter: ["style"] },
);

watch(rows, () => {
  void nextTick(() => virtualizer.value.measure());
});

const bookmarks = computed(() => {
  void store.bookmarkVersion;
  return bookmarkRows(query.value, store.bookmarkList());
});

const specials = computed(() => specialRows(query.value, store.lang));

const matchCount = computed(() => {
  if (view.railTab === "bookmarks") return bookmarks.value.length;
  if (view.railTab === "special") return specials.value.length;
  return outline.value.matched;
});

const tabs = computed(() => {
  void store.bookmarkVersion;
  const counts: Record<RailTab, number> = {
    outline: graph.nodes.length,
    bookmarks: store.bookmarkList().length,
    special: specialScripts.length,
  };
  return TAB_IDS.map((id) => ({ id, labelKey: TAB_LABEL_KEYS[id], count: counts[id] }));
});

const setTab = (tab: RailTab) => {
  if (tab === view.railTab) return;
  view.setRailTab(tab);
};

const focusTab = (id: string) => {
  const button = tablistRef.value?.querySelector<HTMLButtonElement>(`[data-rail="${id}"]`);
  button?.focus();
};

const onTabKeydown = (event: KeyboardEvent) => {
  const current = TAB_IDS.indexOf(view.railTab as RailTab);
  let next = -1;
  if (event.key === "ArrowRight") next = (Math.max(current, 0) + 1) % TAB_IDS.length;
  else if (event.key === "ArrowLeft")
    next = (Math.max(current, 0) + TAB_IDS.length - 1) % TAB_IDS.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = TAB_IDS.length - 1;
  if (next < 0) return;
  event.preventDefault();
  const id = TAB_IDS[next];
  setTab(id);
  focusTab(id);
};

const toggleChapter = (index: number) => {
  if (searching.value) return;
  view.setOutlineChapter(view.outlineChapter === index ? -1 : index);
};

const scrollToRow = (index: number) => {
  if (index < 0) return;
  virtualizer.value.scrollToIndex(index, { align: "auto" });
};

const revealSelected = async (id: string) => {
  const node = graph.nodeById.get(id);
  if (!node) return;
  view.setOutlineChapter(node.chapterIndex);
  if (view.railTab !== "outline") return;
  if (view.overlayRail && !view.railOpen) return;
  await nextTick();
  const index = rows.value.findIndex((row) => row.kind === "node" && row.id === id);
  if (index < 0) return;
  scrollToRow(index);
};

const clearQuery = () => {
  query.value = "";
  searchRef.value?.focus();
};

const pick = (id: string) => {
  store.select(id);
};

const removeBookmark = (id: string) => {
  const on = store.toggleBookmark(id);
  ui.toast(t(on ? "bookmarkAdded" : "bookmarkRemoved"));
};

const clearAll = () => {
  store.clearBookmarks();
  ui.toast(t("bookmarkCleared"));
};

watch(
  () => store.selectedId,
  (id) => {
    if (id) void revealSelected(id);
  },
  { immediate: true },
);
</script>

<template>
  <aside id="chapterRail" :aria-label="t('railTitle')">
    <header class="rail-head">
      <h2 class="rail-title">{{ t("railTitle") }}</h2>
      <button
        id="railClose"
        class="btn btn-icon rail-close rail-close-overlay"
        type="button"
        :title="t('closeTitle')"
        :aria-label="t('closeTitle')"
        @click="view.closeRail"
      >
        <AppIcon name="close" />
      </button>
    </header>

    <div
      ref="tablistRef"
      class="rail-tabs"
      role="tablist"
      :aria-label="t('railTabsLabel')"
      @keydown="onTabKeydown"
    >
      <button
        v-for="tab in tabs"
        :id="`railTab-${tab.id}`"
        :key="tab.id"
        class="rail-tab"
        :class="{ 'is-on': view.railTab === tab.id }"
        :data-rail="tab.id"
        role="tab"
        type="button"
        :aria-selected="view.railTab === tab.id"
        aria-controls="chapterList"
        :tabindex="view.railTab === tab.id ? 0 : -1"
        @click="setTab(tab.id)"
      >
        <span class="rail-tab-text">{{ t(tab.labelKey) }}</span>
        <span class="rail-tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <div class="rail-search">
      <AppIcon name="search" />
      <input
        id="railSearch"
        ref="searchRef"
        v-model="query"
        class="search-input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('railSearchPlaceholder')"
        :aria-label="t('railSearchPlaceholder')"
      />
      <button
        v-if="query"
        class="rail-search-clear"
        type="button"
        :title="t('railSearchClear')"
        :aria-label="t('railSearchClear')"
        @click="clearQuery"
      >
        <AppIcon name="close" />
      </button>
    </div>

    <p v-if="searching" class="cat-result">{{ t("searchCount", { n: matchCount }) }}</p>

    <div
      id="chapterList"
      ref="listRef"
      class="rail-list"
      role="tabpanel"
      :aria-labelledby="`railTab-${view.railTab}`"
    >
      <BookmarksTab
        v-if="view.railTab === 'bookmarks'"
        :rows="bookmarks"
        :selected-id="store.selectedId"
        :searching="searching"
        @pick="pick"
        @remove="removeBookmark"
        @clear="clearAll"
      />
      <SpecialTab
        v-else-if="view.railTab === 'special'"
        :rows="specials"
        :selected-id="store.selectedId"
        @pick="pick"
      />
      <OutlineTab
        v-else
        :items="visible"
        :height="totalHeight"
        :selected-id="store.selectedId"
        :searching="searching"
        :measure="measureElement"
        @toggle="toggleChapter"
        @pick="pick"
      />
    </div>
  </aside>
</template>
