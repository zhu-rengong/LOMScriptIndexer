<script setup lang="ts">
import { graph } from "../../data/graph";
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
      <div class="stats-head-text">
        <h2 id="statsHeading" class="panel-title stats-title">{{ t("statsTitle") }}</h2>
        <p class="stats-note">
          {{ t("statsNote", { n: graph.nodes.length, chapters: graph.chapters.length }) }}
        </p>
      </div>
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
        <div class="stats-head">
          <table class="stats-table">
            <colgroup>
              <col class="col-name" />
              <col v-for="index in 4" :key="index" class="col-num" />
            </colgroup>
            <thead>
              <tr>
                <th class="name" scope="col">{{ t("statsChapter") }}</th>
                <th class="num" scope="col">{{ t("statsScripts") }}</th>
                <th class="num" scope="col">{{ t("statsZh") }}</th>
                <th class="num" scope="col">{{ t("statsEn") }}</th>
                <th class="num" scope="col">{{ t("statsSum") }}</th>
              </tr>
            </thead>
          </table>
        </div>

        <table class="stats-table">
          <colgroup>
            <col class="col-name" />
            <col v-for="index in 4" :key="index" class="col-num" />
          </colgroup>
          <tbody>
            <template v-for="(row, index) in tableRows" :key="`${row.type}-${row.id}-${index}`">
              <tr
                v-if="row.type === 'chapter'"
                class="stats-chapter"
                :class="{ 'is-open': row.isOpen }"
              >
                <th class="name" scope="row">
                  <button
                    class="stats-expand"
                    type="button"
                    :aria-expanded="row.isOpen"
                    @click="toggleChapter(row.id)"
                  >
                    <span class="stats-ord">{{ row.ordinal }}</span>
                    <span class="stats-mark" :style="{ backgroundColor: row.color }"></span>
                    <span class="stats-name">{{ row.title }}</span>
                    <AppIcon class="stats-arrow" name="chevron" />
                  </button>
                </th>
                <td class="num">{{ formatCount(row.scriptCount) }}</td>
                <td class="num">{{ formatCount(row.counts[0]) }}</td>
                <td class="num">{{ formatCount(row.counts[1]) }}</td>
                <td class="num sum">{{ formatCount(row.counts[0] + row.counts[1]) }}</td>
              </tr>
              <tr v-else class="stats-script">
                <td class="name">
                  <span class="stats-script-name">
                    <button
                      class="stats-open btn-link"
                      type="button"
                      :title="t('statsOpen')"
                      @click="openScript(row.id)"
                    >
                      {{ row.id }}
                    </button>
                  </span>
                </td>
                <td class="num muted">—</td>
                <td class="num">{{ formatCount(row.counts[0]) }}</td>
                <td class="num">{{ formatCount(row.counts[1]) }}</td>
                <td class="num sum">{{ formatCount(row.counts[0] + row.counts[1]) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
    </div>

    <p class="panel-hint">{{ t("statsHint") }}</p>
  </div>
</template>
