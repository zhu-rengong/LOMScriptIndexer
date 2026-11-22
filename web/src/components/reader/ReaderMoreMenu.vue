<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
import type { ReaderVisibleKind } from "../../types/beats";
import { UI_IDS } from "../../ui/ids";

const MENU_KEY = "readerMore";

const store = useScriptStore();
const view = useViewStore();
const fold = useFoldStore();

const kinds: { kind: ReaderVisibleKind; labelKey: string }[] = [
  { kind: "dialog", labelKey: "typeDialog" },
  { kind: "think", labelKey: "typeThink" },
  { kind: "narration", labelKey: "typeNarration" },
  { kind: "lore", labelKey: "typeLore" },
];

const open = computed(() => popovers.isOpen(MENU_KEY));

const canForward = computed(() => store.historyIndex < store.history.length - 1);

const secondaryOn = computed(() => view.filtering || view.inferEnabled || view.revealOn);

const foldKey = computed(() => {
  if (fold.state === "expanded") return "readerMoreCollapse";
  if (fold.state === "collapsed") return "readerMoreExpand";
  if (fold.state === "mixed") return "readerMoreMixed";
  return "readerMoreEmpty";
});

const foldDisabled = computed(() => fold.state === "none");

const toggle = (event: MouseEvent) => {
  event.stopPropagation();
  if (popovers.isOpen(MENU_KEY)) popovers.close(MENU_KEY);
  else popovers.open(MENU_KEY, { trigger: byId(UI_IDS.readerMoreBtn) });
};

const forward = () => {
  popovers.close(MENU_KEY);
  store.forward();
};

onMounted(() => {
  popovers.register(MENU_KEY, {
    id: UI_IDS.readerMoreMenu,
    triggerId: UI_IDS.readerMoreBtn,
    group: "menu",
    placement: { align: "end", width: 240, fit: true },
  });
});
</script>

<template>
  <div class="menu-wrap reader-more">
    <span class="tip-host" :title="t('readerMoreTitle')">
      <button
        :id="UI_IDS.readerMoreBtn"
        class="btn btn-icon"
        :class="{ 'is-on': open || secondaryOn }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-controls="UI_IDS.readerMoreMenu"
        :title="t('readerMoreTitle')"
        :aria-label="t('readerMoreTitle')"
        @click.stop="toggle"
      >
        <AppIcon name="more" />
      </button>
    </span>
    <div
      :id="UI_IDS.readerMoreMenu"
      class="menu surface popover"
      role="dialog"
      :aria-label="t('readerMoreTitle')"
      :hidden="!open"
    >
      <button class="menu-item row" type="button" :disabled="!canForward" @click="forward">
        {{ t("readerMoreForward") }}
      </button>

      <div class="menu-head">{{ t("displayFilterHead") }}</div>
      <label
        v-for="item in kinds"
        :key="item.kind"
        class="menu-item display-filter-item"
        :for="`readerMore-${item.kind}`"
      >
        <input
          :id="`readerMore-${item.kind}`"
          class="display-filter-check"
          type="checkbox"
          :checked="view.visibleKinds[item.kind]"
          @change="view.toggleKind(item.kind)"
        />
        <span class="display-filter-label">{{ t(item.labelKey) }}</span>
      </label>

      <div class="menu-sep"></div>

      <button class="menu-item row" type="button" :disabled="foldDisabled" @click="fold.toggle">
        {{ t(foldKey) }}
      </button>
      <button
        class="menu-item row"
        type="button"
        :class="{ 'is-on': view.inferEnabled }"
        :aria-pressed="view.inferEnabled"
        @click="view.toggleInfer"
      >
        {{ t("readerMoreInfer") }}
      </button>
      <button
        class="menu-item row"
        type="button"
        :class="{ 'is-on': view.revealOn }"
        :aria-pressed="view.revealOn"
        @click="view.toggleReveal"
      >
        {{ t("readerMoreReveal") }}
      </button>
    </div>
  </div>
</template>
