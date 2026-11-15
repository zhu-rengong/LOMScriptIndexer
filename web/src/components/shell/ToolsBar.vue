<script setup lang="ts">
import workbuddyIcon from "../../assets/workbuddy.png";
import { langShort, t } from "../../i18n";
import { openInfo } from "../../lib/info";
import { overlay } from "../../lib/overlay";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useScriptStore } from "../../stores/script";
import { useUiStore } from "../../stores/ui";

const store = useScriptStore();
const ui = useUiStore();

const langOpen = computed(() => overlay.isOpen("langMenu"));
const moreOpen = computed(() => overlay.isOpen("moreMenu"));
const settingsOpen = computed(() => overlay.isOpen("settings"));

const langLabel = computed(() => langShort(store.lang));

const tabOn = (tab: "stats" | "help" | "changelog"): boolean =>
  overlay.isOpen("info") && ui.infoTab === tab;

const toggleLang = () => {
  if (overlay.isOpen("langMenu")) overlay.close("langMenu");
  else overlay.open("langMenu");
};

const toggleMore = () => {
  if (overlay.isOpen("moreMenu")) overlay.close("moreMenu");
  else overlay.open("moreMenu");
};

const toggleSettings = () => {
  if (overlay.isOpen("settings")) overlay.close("settings");
  else overlay.open("settings");
};
</script>

<template>
  <div class="tools">
    <div class="tool-group">
      <button
        id="langBtn"
        class="btn"
        :class="{ 'is-on': langOpen }"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="langOpen"
        aria-controls="langMenu"
        :title="t('langBtnTitle')"
        :aria-label="t('langBtnTitle')"
        @click.stop="toggleLang"
      >
        <AppIcon name="lang" />
        <span class="btn-label">{{ langLabel }}</span>
      </button>
    </div>

    <span class="tool-sep"></span>

    <div class="tool-group">
      <button
        id="statsBtn"
        class="btn btn-icon"
        :class="{ 'is-on': tabOn('stats') }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="tabOn('stats')"
        aria-controls="infoPanel"
        :title="t('statsBtnTitle')"
        :aria-label="t('statsBtnTitle')"
        @click="openInfo('stats', UI_IDS.statsBtn)"
      >
        <AppIcon name="stats" />
      </button>
      <button
        id="helpBtn"
        class="btn btn-icon"
        :class="{ 'is-on': tabOn('help') }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="tabOn('help')"
        aria-controls="infoPanel"
        :title="t('helpTitle')"
        :aria-label="t('helpTitle')"
        @click="openInfo('help', UI_IDS.helpBtn)"
      >
        <AppIcon name="help" />
      </button>
      <button
        id="changelogBtn"
        class="btn btn-icon"
        :class="{ 'is-on': tabOn('changelog') }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="tabOn('changelog')"
        aria-controls="infoPanel"
        :title="t('changelogBtnTitle')"
        :aria-label="t('changelogBtnTitle')"
        @click="openInfo('changelog', UI_IDS.changelogBtn)"
      >
        <AppIcon name="log" />
      </button>
    </div>

    <span class="tool-sep"></span>

    <div class="tool-group">
      <a
        id="githubBtn"
        class="btn btn-icon"
        href="https://github.com/zhu-rengong/LOMScriptIndexer"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        :title="t('githubBtnTitle')"
      >
        <AppIcon name="github" />
      </a>
      <a
        id="workbuddyBtn"
        class="btn btn-icon"
        href="https://wbapp-xx74txuyeotgchq6dlrweb.app.workbuddy.host/?sharecode=BZQLRCGPP5"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WorkBuddy"
        :title="t('workbuddyBtnTitle')"
      >
        <img class="workbuddy-ico" :src="workbuddyIcon" alt="" width="16" height="16" />
      </a>
    </div>

    <span class="tool-sep"></span>

    <div class="tool-group">
      <button
        id="settingsBtn"
        class="btn btn-icon"
        :class="{ 'is-on': settingsOpen }"
        type="button"
        aria-haspopup="dialog"
        :aria-expanded="settingsOpen"
        aria-controls="settingsDrawer"
        :title="t('settingsBtnTitle')"
        :aria-label="t('settingsBtnTitle')"
        @click="toggleSettings"
      >
        <AppIcon name="gear" />
      </button>

      <div class="more-wrap">
        <button
          id="moreBtn"
          class="btn btn-icon"
          :class="{ 'is-on': moreOpen }"
          type="button"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          aria-controls="moreMenu"
          :title="t('moreTitle')"
          :aria-label="t('moreTitle')"
          @click.stop="toggleMore"
        >
          <AppIcon name="more" />
        </button>
      </div>
    </div>
  </div>
</template>
