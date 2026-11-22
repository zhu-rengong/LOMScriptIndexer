<script setup lang="ts">
import { t } from "../../i18n";

const store = useScriptStore();
const view = useViewStore();

const scriptTitle = computed(() => store.selected()?.id || "");
</script>

<template>
  <header class="masthead">
    <button
      v-if="view.overlayRail"
      id="railToggle"
      class="btn btn-icon rail-toggle"
      :class="{ 'is-on': view.railOpen }"
      type="button"
      :aria-expanded="view.railOpen"
      aria-controls="chapterRail"
      :title="t('railToggleTitle')"
      :aria-label="t('railToggleTitle')"
      @click="view.toggleRail"
    >
      <AppIcon name="panel" />
    </button>

    <h1 v-if="view.sheetMode" class="node-title" :title="scriptTitle">
      {{ scriptTitle || t("readerEmptyTitle") }}
    </h1>

    <BrandMark v-if="!view.sheetMode" />

    <SearchBox />

    <ToolsBar />
  </header>
</template>
