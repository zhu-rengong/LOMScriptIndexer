<script setup lang="ts">
import { readDataset } from "../../data/access";
import { t } from "../../i18n";

const versionText = computed(() => {
  const version = readDataset().meta.game?.version;
  return version ? t("gameVersion", { ver: version }) : "";
});
</script>

<template>
  <div class="brand">
    <div class="brand-text">
      <h1>{{ t("appTitle") }}</h1>
      <p id="buildLine" class="brand-build">{{ versionText }}</p>
    </div>
  </div>
</template>
