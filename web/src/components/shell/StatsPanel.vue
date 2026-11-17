<script setup lang="ts">
import { wordCount } from "../../data/wordcount";
import { t } from "../../i18n";
import { formatCount } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { statsFilteredTotal, statsTableRows } from "../../lib/stats";
import type { WordPack } from "../../types/text";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useScriptStore } from "../../stores/script";

const store = useScriptStore();

const KIND_LABEL_KEYS: Record<string, string> = {
  dialog: "typeDialog",
  narration: "typeNarration",
  think: "typeThink",
  option: "typeOption",
  lore: "typeLore",
};

const reloadTick = ref(0);
const loading = ref(false);
const activeKind = ref("all");
const openChapter = ref("");

const open = computed(() => overlay.isOpen("stats"));

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

const close = () => overlay.close("stats");

const pickKind = (id: string) => {
  if (activeKind.value === id) return;
  activeKind.value = id;
};

const toggleChapter = (id: string) => {
  openChapter.value = openChapter.value === id ? "" : id;
};

const openScript = (id: string) => {
  overlay.close("stats");
  store.select(id, { history: true });
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
  overlay.register("stats", {
    id: UI_IDS.statsPanel,
    triggerId: UI_IDS.statsBtn,
    group: "modal",
    autofocus: UI_IDS.statsClose,
  });
});
</script>

<template>
  <div
    id="statsPanel"
    class="stats-panel surface"
    role="dialog"
    aria-modal="true"
    aria-labelledby="statsHeading"
    :hidden="!open"
  >
    <header class="panel-head stats-panel-head">
      <h2 id="statsHeading" class="panel-title">{{ t("statsTitle") }}</h2>
      <button
        id="statsClose"
        class="btn btn-icon"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>

    <div id="statsSummary" class="stats-summary">
      <div class="stat-card">
        <span class="stat-value">{{ formatCount(totals[0]) }}</span>
        <span class="stat-label">{{ t("statsZh") }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ formatCount(totals[1]) }}</span>
        <span class="stat-label">{{ t("statsEn") }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{{ formatCount(totals[0] + totals[1]) }}</span>
        <span class="stat-label">{{ t("statsSum") }}</span>
      </div>
    </div>

    <div id="statsKinds" class="stats-kinds" role="tablist" :aria-label="t('statsTitle')">
      <button
        v-for="item in kindItems"
        :key="item.id"
        class="stats-kind"
        :class="{ 'is-on': item.id === activeKind }"
        type="button"
        role="tab"
        :aria-selected="item.id === activeKind"
        aria-controls="statsBody"
        @click="pickKind(item.id)"
      >
        {{ t(item.key) }}
      </button>
    </div>

    <div id="statsBody" class="stats-body">
      <template v-if="!wordPack">
        <p :class="loading ? 'stats-loading' : 'stats-empty'">
          {{ t(loading ? "statsLoading" : "statsEmpty") }}
        </p>
      </template>
      <template v-else>
        <div class="stats-table" role="table">
          <div class="stats-head-row" role="row">
            <span class="stats-cell" role="columnheader">{{ t("statsChapter") }}</span>
            <span class="stats-cell num" role="columnheader">{{ t("statsScripts") }}</span>
            <span class="stats-cell num" role="columnheader">{{ t("statsZh") }}</span>
            <span class="stats-cell num" role="columnheader">{{ t("statsEn") }}</span>
            <span class="stats-cell num" role="columnheader">{{ t("statsSum") }}</span>
          </div>
          <template v-for="(row, index) in tableRows" :key="`${row.type}-${row.id}-${index}`">
            <div
              v-if="row.type === 'chapter'"
              class="stats-chapter"
              :class="{ 'is-open': row.isOpen, 'is-solo': row.solo }"
              role="row"
            >
              <span class="stats-cell" role="cell">
                <button
                  class="stats-expand"
                  type="button"
                  :aria-expanded="row.isOpen"
                  @click="toggleChapter(row.id)"
                >
                  <span class="stats-name">{{ row.title }}</span>
                  <AppIcon class="stats-arrow" name="chevron" />
                </button>
              </span>
              <span class="stats-cell num" role="cell">{{ formatCount(row.scriptCount) }}</span>
              <span class="stats-cell num" role="cell">{{ formatCount(row.counts[0]) }}</span>
              <span class="stats-cell num" role="cell">{{ formatCount(row.counts[1]) }}</span>
              <span class="stats-cell num" role="cell">
                {{ formatCount(row.counts[0] + row.counts[1]) }}
              </span>
            </div>
            <div
              v-else
              class="stats-script"
              :class="{ 'is-on': row.id === store.selectedId, 'is-card-end': row.last }"
              role="row"
            >
              <span class="stats-cell" role="cell">
                <button
                  class="stats-open btn-link"
                  type="button"
                  :title="t('statsOpen')"
                  @click="openScript(row.id)"
                >
                  {{ row.id }}
                </button>
              </span>
              <span class="stats-cell num" role="cell"></span>
              <span class="stats-cell num" role="cell">{{ formatCount(row.counts[0]) }}</span>
              <span class="stats-cell num" role="cell">{{ formatCount(row.counts[1]) }}</span>
              <span class="stats-cell num" role="cell">
                {{ formatCount(row.counts[0] + row.counts[1]) }}
              </span>
            </div>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
