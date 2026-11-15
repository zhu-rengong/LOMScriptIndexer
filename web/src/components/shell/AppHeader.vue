<script setup lang="ts">
import { dataset } from "../../data/dataset";
import { t } from "../../i18n";
import AppIcon from "../ui/AppIcon.vue";
import SearchBox from "./SearchBox.vue";
import ToolsBar from "./ToolsBar.vue";
import { useViewStore } from "../../stores/view";

const view = useViewStore();

const versionText = computed(() => {
  const version = dataset.meta.game?.version;
  return version ? t("gameVersion", { ver: version }) : "";
});
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

    <div class="brand">
      <span class="seal" aria-hidden="true">活</span>
      <div class="brand-text">
        <h1>{{ t("appTitle") }}</h1>
        <p id="buildLine" class="brand-build">{{ versionText }}</p>
      </div>
    </div>

    <SearchBox />
    <ToolsBar />
  </header>
</template>
