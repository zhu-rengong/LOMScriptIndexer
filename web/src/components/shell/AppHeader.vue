<script setup lang="ts">
import { t } from "../../i18n";

const store = useScriptStore();
const view = useViewStore();

const scriptTitle = computed(() => store.selected()?.id || "");
</script>

<template>
  <header class="masthead">
    <button
      id="railToggle"
      class="btn btn-icon rail-toggle rail-toggle-overlay"
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

    <h1 class="node-title masthead-title" :title="scriptTitle">
      {{ scriptTitle || t("readerEmptyTitle") }}
    </h1>

    <BrandMark />

    <SearchBox />

    <ToolsBar />
  </header>
</template>
