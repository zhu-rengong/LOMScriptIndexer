<script setup lang="ts">
import { useVirtualList } from "@vueuse/core";
import { graph } from "../../data/graph";
import { specialScripts } from "../../data/special";
import { t } from "../../i18n";
import { toNeedle } from "../../lib/browser";
import { bookmarkRows, outlineRows, specialRows } from "../../lib/rail";
import AppIcon from "../ui/AppIcon.vue";
import BookmarksTab from "./rail/BookmarksTab.vue";
import OutlineTab from "./rail/OutlineTab.vue";
import SpecialTab from "./rail/SpecialTab.vue";
import { useScriptStore } from "../../stores/script";
import { useUiStore } from "../../stores/ui";
import { useViewStore } from "../../stores/view";

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

const rowHeight = reactive({ chapter: 44, node: 32 });

const heightOf = (index: number): number => {
  const row = rows.value[index];
  return row && row.kind === "chapter" ? rowHeight.chapter : rowHeight.node;
};

const { list: outlineItems, wrapperProps, containerProps } = useVirtualList(rows, {
  itemHeight: heightOf,
  overscan: 12,
});

watchEffect(() => {
  containerProps.ref.value = listRef.value;
});

let staleHeights = true;

const measureRows = () => {
  if (!staleHeights) return;
  const element = listRef.value;
  if (!element) return;
  const chapter = element.querySelector<HTMLElement>(".cat-chap")?.offsetHeight ?? 0;
  const node = element.querySelector<HTMLElement>(".rail-vrow")?.offsetHeight ?? 0;
  if (chapter > 0) rowHeight.chapter = chapter;
  if (node > 0) rowHeight.node = node;
  staleHeights = chapter <= 0 || node <= 0;
};

const invalidateHeights = () => {
  staleHeights = true;
  measureRows();
};

watch(outlineItems, () => measureRows(), { flush: "post" });

const coarse = window.matchMedia("(pointer: coarse)");
const typography = new MutationObserver(invalidateHeights);

onMounted(() => {
  measureRows();
  coarse.addEventListener("change", invalidateHeights);
  typography.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  void nextTick(() => {
    containerProps.ref.value = listRef.value;
    containerProps.onScroll();
  });
});

onBeforeUnmount(() => {
  coarse.removeEventListener("change", invalidateHeights);
  typography.disconnect();
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

const summary = computed(() =>
  t("railSummary", { chapters: graph.chapters.length, scripts: graph.nodes.length }),
);

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
  const element = containerProps.ref.value;
  if (!element) return;
  let top = 0;
  for (let step = 0; step < index; step++) top += heightOf(step);
  const height = heightOf(index);
  if (top < element.scrollTop) element.scrollTop = top;
  else if (top + height > element.scrollTop + element.clientHeight)
    element.scrollTop = top + height - element.clientHeight;
};

const revealSelected = async (id: string) => {
  const node = graph.nodeById.get(id);
  if (!node) return;
  view.setOutlineChapter(node.chapterIndex);
  if (view.railTab !== "outline") return;
  if (view.isOverlayRail() && !view.railOpen) return;
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
  if (!store.select(id, { history: true })) return;
  if (view.isOverlayRail()) view.closeRail();
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
      <div class="rail-head-text">
        <h2 class="rail-title">{{ t("railTitle") }}</h2>
        <p class="rail-summary">{{ summary }}</p>
      </div>
      <button
        id="railClose"
        class="btn btn-icon rail-close"
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
      @scroll="containerProps.onScroll"
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
        :items="outlineItems"
        :wrapper-style="wrapperProps.style"
        :selected-id="store.selectedId"
        :searching="searching"
        @toggle="toggleChapter"
        @pick="pick"
      />
    </div>
  </aside>
</template>
