<script setup lang="ts">
import { useStatsPanel } from "../../composables/useStatsPanel";
import { t } from "../../i18n";
import { formatCount } from "../../lib/numbers";
import AppIcon from "../ui/AppIcon.vue";

const {
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
} = useStatsPanel();
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
        <p :class="loading ? 'stats-loading' : 'stats-empty empty-state'">
          {{ t(loading ? "statsLoading" : "statsEmpty") }}
        </p>
      </template>
      <template v-else>
        <div class="stats-table">
          <div class="stats-head-row">
            <span class="stats-cell">{{ t("statsChapter") }}</span>
            <span class="stats-cell num">{{ t("statsScripts") }}</span>
            <span class="stats-cell num">{{ t("statsZh") }}</span>
            <span class="stats-cell num">{{ t("statsEn") }}</span>
            <span class="stats-cell num">{{ t("statsSum") }}</span>
          </div>
          <template v-for="(row, index) in tableRows" :key="`${row.type}-${row.id}-${index}`">
            <button
              v-if="row.type === 'chapter'"
              class="stats-chapter"
              :class="{ 'is-open': row.isOpen, 'is-solo': row.solo }"
              type="button"
              :aria-expanded="row.isOpen"
              @click="toggleChapter(row.id)"
            >
              <span class="stats-cell">
                <AppIcon class="stats-arrow" name="chevron" />
                <span class="stats-name">{{ row.title }}</span>
              </span>
              <span class="stats-cell num">{{ formatCount(row.scriptCount) }}</span>
              <span class="stats-cell num">{{ formatCount(row.counts[0]) }}</span>
              <span class="stats-cell num">{{ formatCount(row.counts[1]) }}</span>
              <span class="stats-cell num">
                {{ formatCount(row.counts[0] + row.counts[1]) }}
              </span>
            </button>
            <button
              v-else
              class="stats-script"
              :class="{ 'is-card-end': row.last }"
              type="button"
              :title="t('statsOpen')"
              @click="openScript(row.id)"
            >
              <span class="stats-cell">{{ row.id }}</span>
              <span class="stats-cell num"></span>
              <span class="stats-cell num">{{ formatCount(row.counts[0]) }}</span>
              <span class="stats-cell num">{{ formatCount(row.counts[1]) }}</span>
              <span class="stats-cell num">
                {{ formatCount(row.counts[0] + row.counts[1]) }}
              </span>
            </button>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
