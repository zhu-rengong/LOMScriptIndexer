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
import PanelShell from "../ui/PanelShell.vue";
import { useScriptStore } from "../../stores/script";
import { useUiStore, type InfoTab } from "../../stores/ui";

const TABS: { id: InfoTab; key: string }[] = [
  { id: "stats", key: "statsBtn" },
  { id: "help", key: "helpTitle" },
  { id: "changelog", key: "changelogTitle" },
];

const HELP_GROUPS: { title: string; rows: [string, string][] }[] = [
  { title: "helpGroupNav", rows: [["← / →", "hkHistory"]] },
  {
    title: "helpGroupRead",
    rows: [
      ["B", "hkBookmark"],
      ["C", "hkCondInfer"],
      ["F", "hkInfer"],
      ["H", "revealBtnTitle"],
      ["?", "hkHelp"],
      ["J", "navBtnTitle"],
    ],
  },
];

const ENTRIES = [
  { date: "2026-11-14", from: "cdd547d", to: "5304cb5", key: "changelogEntry3" },
  { date: "2026-11-12", from: "d4c13de", to: "7aeb894", key: "changelogEntry2" },
  { date: "2026-11-07", from: "6a7e45e", to: "e3a4075", key: "changelogEntry1" },
];

const KIND_LABEL_KEYS: Record<string, string> = {
  dialog: "typeDialog",
  narration: "typeNarration",
  think: "typeThink",
  option: "typeOption",
  lore: "typeLore",
};

const store = useScriptStore();
const ui = useUiStore();

const reloadTick = ref(0);
const loading = ref(false);
const activeKind = ref("all");
const openChapter = ref("");

const open = computed(() => overlay.isOpen("info"));

const tabTitle = computed(() =>
  t(ui.infoTab === "stats" ? "statsTitle" : ui.infoTab === "help" ? "helpTitle" : "changelogTitle"),
);

const tabSummary = computed(() =>
  ui.infoTab === "stats"
    ? t("statsNote", { n: graph.nodes.length, chapters: graph.chapters.length })
    : "",
);

const tabHint = computed(() =>
  ui.infoTab === "stats"
    ? t("statsHint")
    : ui.infoTab === "help"
      ? t("helpHint")
      : t("changelogHint"),
);

const tabSize = computed<"sm" | "md" | "lg">(() =>
  ui.infoTab === "stats" ? "lg" : ui.infoTab === "help" ? "md" : "sm",
);

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

const pickKind = (id: string) => {
  if (activeKind.value === id) return;
  activeKind.value = id;
};

const toggleChapter = (id: string) => {
  openChapter.value = openChapter.value === id ? "" : id;
};

const openScript = (id: string) => {
  overlay.close("info");
  store.select(id, { history: true });
};

const load = () => {
  loading.value = true;
  void wordCount.load().then(() => {
    loading.value = false;
    reloadTick.value++;
  });
};

watch([open, () => ui.infoTab], ([isOpen, tab]) => {
  if (!isOpen || tab !== "stats") return;
  openChapter.value = "";
  if (!wordCount.pack()) load();
});
</script>

<template>
  <PanelShell
    :id="UI_IDS.infoPanel"
    overlay-key="info"
    kind="dialog"
    :size="tabSize"
    role="dialog"
    modal
    :title="tabTitle"
    :summary="tabSummary"
    heading-id="infoHeading"
    :close-id="UI_IDS.infoClose"
    :close-title="t('closeTitle')"
    :trigger-id="UI_IDS.statsBtn"
    group="modal"
    :autofocus="UI_IDS.infoClose"
  >
    <div class="tabs tabs-lined info-tabs" role="tablist" :aria-label="t('infoSections')">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        class="tab"
        :class="{ 'is-on': ui.infoTab === tab.id }"
        type="button"
        role="tab"
        :aria-selected="ui.infoTab === tab.id"
        @click="ui.setInfoTab(tab.id)"
      >
        <span class="tab-text">{{ t(tab.key) }}</span>
      </button>
    </div>

    <section v-if="ui.infoTab === 'stats'" class="info-stack">
      <div class="stats-summary">
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

      <div class="tabs tabs-lined stats-kinds" role="tablist" :aria-label="t('statsTitle')">
        <button
          v-for="item in kindItems"
          :key="item.id"
          class="tab"
          :class="{ 'is-on': item.id === activeKind }"
          type="button"
          role="tab"
          :aria-selected="item.id === activeKind"
          @click="pickKind(item.id)"
        >
          <span class="tab-text">{{ t(item.key) }}</span>
        </button>
      </div>

      <p v-if="!wordPack" class="status">
        {{ t(loading ? "statsLoading" : "statsEmpty") }}
      </p>
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
                    <span class="icon-mark" :style="{ color: row.color }"></span>
                    <span class="stats-name">{{ row.title }}</span>
                    <AppIcon class="stats-arrow" name="chevron" />
                  </button>
                </th>
                <td class="num">{{ formatCount(row.scriptCount) }}</td>
                <td class="num">{{ formatCount(row.counts[0]) }}</td>
                <td class="num">{{ formatCount(row.counts[1]) }}</td>
                <td class="num">{{ formatCount(row.counts[0] + row.counts[1]) }}</td>
              </tr>
              <tr v-else class="stats-script">
                <td class="name">
                  <span class="stats-script-name">
                    <button
                      class="link"
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
                <td class="num">{{ formatCount(row.counts[0] + row.counts[1]) }}</td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
    </section>

    <section v-else-if="ui.infoTab === 'help'" class="info-stack">
      <div v-for="group in HELP_GROUPS" :key="group.title">
        <h3 class="help-group-title">{{ t(group.title) }}</h3>
        <dl class="help-list">
          <template v-for="row in group.rows" :key="row[0]">
            <dt><kbd>{{ row[0] }}</kbd></dt>
            <dd class="help-desc">{{ t(row[1]) }}</dd>
          </template>
        </dl>
      </div>
    </section>

    <section v-else class="info-stack">
      <article v-for="(entry, index) in ENTRIES" :key="entry.key" class="changelog-entry">
        <div class="changelog-meta">
          <span class="changelog-date">{{ entry.date }}</span>
          <span class="changelog-range">{{ `${entry.from} → ${entry.to}` }}</span>
          <span v-if="index === 0" class="changelog-badge">{{ t("changelogLatest") }}</span>
        </div>
        <p class="changelog-text">{{ t(entry.key) }}</p>
      </article>
    </section>

    <template #hint>{{ tabHint }}</template>
  </PanelShell>
</template>
