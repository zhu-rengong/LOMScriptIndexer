<script setup lang="ts">
import { t } from "../../i18n";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const ENTRIES = [
  { date: "2026-11-24", key: "changelogEntry10" },
  { date: "2026-11-23", key: "changelogEntry9" },
  { date: "2026-11-22", key: "changelogEntry8" },
  { date: "2026-11-21", key: "changelogEntry7" },
  { date: "2026-11-18", key: "changelogEntry6" },
  { date: "2026-11-17", key: "changelogEntry5" },
  { date: "2026-11-16", key: "changelogEntry4" },
  { date: "2026-11-14", key: "changelogEntry3" },
  { date: "2026-11-12", key: "changelogEntry2" },
  { date: "2026-11-07", key: "changelogEntry1" },
];

const open = computed(() => popovers.isOpen("changelog"));

const close = () => popovers.close("changelog");

onMounted(() => {
  popovers.register("changelog", {
    id: UI_IDS.changelogPanel,
    triggerId: UI_IDS.changelogBtn,
    group: "modal",
    autofocus: UI_IDS.changelogClose,
  });
});
</script>

<template>
  <div class="scrim scrim-sheet" :hidden="!open" @click="close"></div>
  <div
    :id="UI_IDS.changelogPanel"
    class="changelog-panel surface"
    role="dialog"
    aria-modal="true"
    aria-labelledby="changelogHeading"
    :hidden="!open"
  >
    <header class="panel-head">
      <h2 id="changelogHeading" class="panel-title">{{ t("changelogTitle") }}</h2>
      <button
        :id="UI_IDS.changelogClose"
        class="btn btn-icon"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>
    <div id="changelogBody" class="changelog-body">
      <article v-for="(entry, index) in ENTRIES" :key="entry.key" class="changelog-entry">
        <div class="changelog-meta">
          <span class="changelog-date">{{ entry.date }}</span>
          <span v-if="index === 0" class="changelog-badge">{{ t("changelogLatest") }}</span>
        </div>
        <p class="changelog-text">{{ t(entry.key) }}</p>
      </article>
    </div>
  </div>
</template>
