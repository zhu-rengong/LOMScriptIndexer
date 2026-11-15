<script setup lang="ts">
import { t } from "../../i18n";
import type { FoldState } from "../../stores/fold";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useFoldStore } from "../../stores/fold";

const ICONS: Record<FoldState, string> = {
  none: "fold-close",
  collapsed: "fold-close",
  mixed: "fold-mixed",
  expanded: "fold-open",
};

const LABELS: Record<FoldState, string> = {
  none: "foldBtnEmpty",
  collapsed: "foldBtnCollapsed",
  mixed: "foldBtnMixed",
  expanded: "foldBtnExpanded",
};

const fold = useFoldStore();

const icon = computed(() => ICONS[fold.state]);

const label = computed(() => t(LABELS[fold.state]));

const isDisabled = computed(() => fold.state === "none");
</script>

<template>
  <span class="tip-host" :title="label">
    <button
      :id="UI_IDS.foldToggleBtn"
      class="btn btn-icon btn-sm"
      type="button"
      :disabled="isDisabled"
      :title="label"
      :aria-label="label"
      @click="fold.toggle"
    >
      <AppIcon :name="icon" />
    </button>
  </span>
</template>
