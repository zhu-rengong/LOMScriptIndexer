<script setup lang="ts">
import { graph } from "../../data/graph";
import { chapterTitle, t, timeText } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import DisplayFilterMenu from "./DisplayFilterMenu.vue";
import FoldToggle from "./FoldToggle.vue";
import NavMenu from "./NavMenu.vue";
import { useScriptStore } from "../../stores/script";
import { useViewStore } from "../../stores/view";
import { useUiStore } from "../../stores/ui";

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

const navOpen = computed(() => overlay.isOpen("navMenu"));

const inferOn = computed(() => view.inferEnabled);

const condInferOn = computed(() => view.condInferEnabled);

const revealOn = computed(() => view.revealOn);

const chapterTitleText = computed(() =>
  selectedScript.value ? chapterTitle(graph.chapterOf(selectedScript.value)) : "",
);

const toggleNav = (event: MouseEvent) => {
  event.stopPropagation();
  if (overlay.isOpen("navMenu")) overlay.close("navMenu");
  else overlay.open("navMenu", { trigger: byId(UI_IDS.navBtn) });
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
        <div class="reader-headline">
          <p id="nodeChapter" class="crumb" :hidden="!selectedScript">
            <template v-if="selectedScript">
              {{ chapterTitleText
              }}<span v-if="typeof selectedScript.time === 'number'" class="crumb-time">{{
                `${t("sepPair")}${timeText(selectedScript.time)}`
              }}</span>
            </template>
          </p>
          <h2 id="nodeTitle" class="node-title" :title="selectedScript ? selectedScript.id : ''">
            {{ selectedScript ? selectedScript.id : t("readerEmptyTitle") }}
          </h2>
        </div>
        <div class="reader-actions">
          <span class="tip-host" :title="t('backTitle')">
            <button
              id="backBtn"
              class="btn btn-icon btn-sm"
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
              class="btn btn-icon btn-sm"
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
          <span class="tip-host" :title="t('condInferBtnTitle')">
            <button
              id="condInferBtn"
              class="btn btn-icon btn-sm"
              :class="{ 'is-on': condInferOn }"
              type="button"
              :aria-pressed="condInferOn"
              :title="t('condInferBtnTitle')"
              :aria-label="t('condInferBtnTitle')"
              @click="view.toggleCondInfer"
            >
              <span class="infer-toggle-mark" aria-hidden="true">析</span>
            </button>
          </span>
          <span class="tip-host" :title="t('inferBtnTitle')">
            <button
              id="inferBtn"
              class="btn btn-icon btn-sm"
              :class="{ 'is-on': inferOn }"
              type="button"
              :aria-pressed="inferOn"
              :title="t('inferBtnTitle')"
              :aria-label="t('inferBtnTitle')"
              @click="view.toggleInfer"
            >
              <span class="infer-toggle-mark" aria-hidden="true">{{ t("inferMark") }}</span>
            </button>
          </span>
          <span class="tip-host" :title="t('revealBtnTitle')">
            <button
              id="revealBtn"
              class="btn btn-icon btn-sm"
              :class="{ 'is-on': revealOn }"
              type="button"
              :aria-pressed="revealOn"
              :title="t('revealBtnTitle')"
              :aria-label="t('revealBtnTitle')"
              @click="view.toggleReveal"
            >
              <AppIcon :name="revealOn ? 'eye-off' : 'eye'" />
            </button>
          </span>
          <div class="menu-wrap reader-nav" id="navWrap">
            <span class="tip-host" :title="t('navBtnTitle')">
              <button
                id="navBtn"
                class="btn btn-icon btn-sm"
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
              class="btn btn-icon btn-sm"
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
