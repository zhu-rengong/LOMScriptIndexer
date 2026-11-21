<script setup lang="ts">
import { t } from "../../i18n";

const view = useViewStore();
</script>

<template>
  <header class="masthead">
    <button
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

    <BrandMark />

    <SearchBox />

    <ToolsBar />
  </header>
</template>
