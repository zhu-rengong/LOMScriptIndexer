<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const store = useScriptStore();
const view = useViewStore();
const ui = useUiStore();

const selectedScript = computed(() => store.selected());

const canBack = computed(() => store.historyIndex > 0);

const canForward = computed(() => store.historyIndex < store.history.length - 1);

const isBookmarked = computed(() => {
  void store.bookmarkVersion;
  return !!selectedScript.value && store.isBookmarked(selectedScript.value.id);
});

const navOpen = computed(() => popovers.isOpen("navMenu"));

const inferOn = computed(() => view.inferEnabled);

const revealOn = computed(() => view.revealOn);

const toggleNav = (event: MouseEvent) => {
  event.stopPropagation();
  if (popovers.isOpen("navMenu")) popovers.close("navMenu");
  else popovers.open("navMenu", { trigger: byId(UI_IDS.navBtn) });
};

const toggleBookmark = () => {
  const current = selectedScript.value;
  if (!current) return;
  const on = store.toggleBookmark(current.id);
  ui.toast(t(on ? "bookmarkAdded" : "bookmarkRemoved"));
};
</script>

<template>
  <header class="reader-head">
    <div class="reader-title">
      <div class="reader-title-row">
        <h2
          v-if="!view.sheetMode"
          id="nodeTitle"
          class="node-title"
          :title="selectedScript ? selectedScript.id : ''"
        >
          {{ selectedScript ? selectedScript.id : t("readerEmptyTitle") }}
        </h2>
        <div class="reader-actions">
          <span class="tip-host" :title="t('backTitle')">
            <button
              id="backBtn"
              class="btn btn-icon"
              type="button"
              :title="t('backTitle')"
              :aria-label="t('backTitle')"
              :disabled="!canBack"
              @click="store.back()"
            >
              <AppIcon name="back" />
            </button>
          </span>
          <span class="tip-host" :title="t('forwardTitle')">
            <button
              id="forwardBtn"
              class="btn btn-icon"
              type="button"
              :title="t('forwardTitle')"
              :aria-label="t('forwardTitle')"
              :disabled="!canForward"
              @click="store.forward()"
            >
              <AppIcon name="forward" />
            </button>
          </span>
          <DisplayFilterMenu />
          <FoldToggle />
          <span class="tip-host" :title="t('inferBtnTitle')">
            <button
              id="inferBtn"
              class="btn btn-icon"
              :class="{ 'is-on': inferOn }"
              type="button"
              :aria-pressed="inferOn"
              :title="t('inferBtnTitle')"
              :aria-label="t('inferBtnTitle')"
              @click="view.toggleInfer"
            >
              <span class="infer-toggle-mark" aria-hidden="true">
                <AppIcon name="entails" />
              </span>
            </button>
          </span>
          <span class="tip-host" :title="t('revealBtnTitle')">
            <button
              id="revealBtn"
              class="btn btn-icon"
              :class="{ 'is-on': revealOn }"
              type="button"
              :aria-pressed="revealOn"
              :title="t('revealBtnTitle')"
              :aria-label="t('revealBtnTitle')"
              @click="view.toggleReveal"
            >
              <AppIcon :name="revealOn ? 'eye' : 'eye-off'" />
            </button>
          </span>
          <div id="navWrap" class="menu-wrap reader-nav">
            <span class="tip-host" :title="t('navBtnTitle')">
              <button
                id="navBtn"
                class="btn btn-icon"
                :class="{ 'is-on': navOpen }"
                type="button"
                aria-haspopup="true"
                :aria-expanded="navOpen"
                aria-controls="navMenu"
                :title="t('navBtnTitle')"
                :aria-label="t('navBtnTitle')"
                :disabled="!selectedScript"
                @click="toggleNav"
              >
                <AppIcon name="jump" />
              </button>
            </span>
            <NavMenu />
          </div>
          <span
            class="tip-host"
            :title="t(isBookmarked ? 'bookmarkRemoveTitle' : 'bookmarkAddTitle')"
          >
            <button
              id="bookmarkBtn"
              class="btn btn-icon"
              type="button"
              :aria-pressed="isBookmarked"
              :aria-label="t(isBookmarked ? 'bookmarkRemoveTitle' : 'bookmarkAddTitle')"
              :title="t(isBookmarked ? 'bookmarkRemoveTitle' : 'bookmarkAddTitle')"
              @click="toggleBookmark"
            >
              <AppIcon name="star" />
            </button>
          </span>
        </div>
      </div>
    </div>
  </header>
</template>
