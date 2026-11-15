<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import type { ReaderVisibleKind } from "../../types/beats";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useViewStore } from "../../stores/view";

const MENU_KEY = "displayFilter";

const view = useViewStore();

const items: { kind: ReaderVisibleKind; labelKey: string }[] = [
  { kind: "dialog", labelKey: "typeDialog" },
  { kind: "think", labelKey: "typeThink" },
  { kind: "narration", labelKey: "typeNarration" },
  { kind: "lore", labelKey: "typeLore" },
];

const open = computed(() => overlay.isOpen(MENU_KEY));

const toggle = (event: MouseEvent) => {
  event.stopPropagation();
  if (overlay.isOpen(MENU_KEY)) overlay.close(MENU_KEY);
  else overlay.open(MENU_KEY, { trigger: byId(UI_IDS.displayFilterBtn) });
};

onMounted(() => {
  overlay.register(MENU_KEY, {
    id: UI_IDS.displayFilterMenu,
    triggerId: UI_IDS.displayFilterBtn,
    group: "menu",
    placement: { align: "end", width: 200, fit: true },
  });
});
</script>

<template>
  <div class="menu-wrap display-filter">
    <span class="tip-host" :title="t('displayFilterTitle')">
      <button
        :id="UI_IDS.displayFilterBtn"
        class="btn btn-icon btn-sm"
        :class="{ 'is-on': view.filtering }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-controls="UI_IDS.displayFilterMenu"
        :title="t('displayFilterTitle')"
        :aria-label="t('displayFilterTitle')"
        @click="toggle"
      >
        <AppIcon name="filter" />
      </button>
    </span>
    <div
      :id="UI_IDS.displayFilterMenu"
      class="menu display-filter-menu surface popover"
      role="dialog"
      :aria-label="t('displayFilterTitle')"
      :hidden="!open"
    >
      <div class="menu-head">{{ t("displayFilterHead") }}</div>
      <label
        v-for="item in items"
        :key="item.kind"
        class="menu-item display-filter-item"
        :for="`displayFilter-${item.kind}`"
      >
        <input
          :id="`displayFilter-${item.kind}`"
          class="display-filter-check"
          type="checkbox"
          :checked="view.visibleKinds[item.kind]"
          @change="view.toggleKind(item.kind)"
        />
        <span class="display-filter-label">{{ t(item.labelKey) }}</span>
      </label>
    </div>
  </div>
</template>
