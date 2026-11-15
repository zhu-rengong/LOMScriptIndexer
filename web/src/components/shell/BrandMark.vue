<script setup lang="ts">
import { dataset } from "../../data/dataset";
import { t } from "../../i18n";

const versionText = computed(() => {
  const version = dataset.meta.game?.version;
  return version ? t("gameVersion", { ver: version }) : "";
});
</script>

<template>
  <div class="brand">
    <span class="seal" aria-hidden="true">活</span>
    <div class="brand-text">
      <h1>{{ t("appTitle") }}</h1>
      <p id="buildLine" class="brand-build">{{ versionText }}</p>
    </div>
  </div>
</template>
