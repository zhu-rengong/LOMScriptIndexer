<script setup lang="ts">
import { t } from "../../i18n";
import AppIcon from "../ui/AppIcon.vue";

defineProps<{ noSelection: boolean; isScriptFileEmpty?: boolean }>();
</script>

<template>
  <div class="empty-state">
    <template v-if="noSelection">
      <span class="brush"><AppIcon name="scroll" /></span>
      <h3>{{ t("emptyH3") }}</h3>
      <p>{{ t("emptyP") }}</p>
      <p class="hint-line">{{ t("emptyHint") }}</p>
    </template>
    <template v-else>
      <span class="brush"><AppIcon name="page" /></span>
      <h3>{{ t("noBeatsTitle") }}</h3>
      <p>{{ t(isScriptFileEmpty ? "noBeatsEmpty" : "noBeatsOther") }}</p>
    </template>
  </div>
</template>
