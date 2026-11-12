<script setup lang="ts">
import { t } from "../../i18n";
import { overlay } from "../../lib/overlay";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";

const ENTRIES = [
  { date: "2026-11-12", from: "d4c13de", to: "7aeb894", key: "changelogEntry2" },
  { date: "2026-11-07", from: "6a7e45e", to: "e3a4075", key: "changelogEntry1" },
];

const open = computed(() => overlay.isOpen("changelog"));

const close = () => overlay.close("changelog");

onMounted(() => {
  overlay.register("changelog", {
    id: UI_IDS.changelogPanel,
    triggerId: UI_IDS.changelogBtn,
    group: "modal",
    autofocus: UI_IDS.changelogClose,
  });
});
</script>

<template>
  <div
    id="changelogPanel"
    class="changelog-panel surface"
    role="dialog"
    aria-modal="true"
    aria-labelledby="changelogHeading"
    :hidden="!open"
  >
    <header class="panel-head">
      <h2 id="changelogHeading" class="panel-title">{{ t("changelogTitle") }}</h2>
      <button
        id="changelogClose"
        class="btn btn-icon btn-sm"
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
          <span class="changelog-range">{{ `${entry.from} → ${entry.to}` }}</span>
          <span v-if="index === 0" class="changelog-badge">{{ t("changelogLatest") }}</span>
        </div>
        <p class="changelog-text">{{ t(entry.key) }}</p>
      </article>
    </div>
    <p class="panel-hint">{{ t("changelogHint") }}</p>
  </div>
</template>
