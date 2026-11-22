<script setup lang="ts">
import { langShort, t } from "../../i18n";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";
import type { OverlayKey } from "../../ui/ids";

const store = useScriptStore();
const view = useViewStore();

const langOpen = computed(() => popovers.isOpen("langMenu"));
const moreOpen = computed(() => popovers.isOpen("moreMenu"));
const statsOpen = computed(() => popovers.isOpen("stats"));
const helpOpen = computed(() => popovers.isOpen("help"));
const changelogOpen = computed(() => popovers.isOpen("changelog"));
const settingsOpen = computed(() => popovers.isOpen("settings"));

const langLabel = computed(() => langShort(store.lang));

const toggle = (key: OverlayKey) => {
  if (popovers.isOpen(key)) popovers.close(key);
  else popovers.open(key);
};

const toggleSearch = () => {
  if (view.searchOpen) {
    popovers.close("searchResults");
    view.collapseSearch();
    return;
  }
  view.openSearch();
  void nextTick(() => byId(UI_IDS.search)?.focus());
};
</script>

<template>
  <div class="tools">
    <button
      :id="UI_IDS.searchToggle"
      class="btn btn-icon search-toggle"
      :class="{ 'is-on': view.searchOpen }"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="view.searchOpen"
      :aria-controls="UI_IDS.search"
      :title="t('searchTitle')"
      :aria-label="t('searchTitle')"
      @click="toggleSearch"
    >
      <AppIcon name="search" />
    </button>

    <div class="menu-wrap">
      <button
        id="langBtn"
        class="btn lang-btn"
        :class="{ 'is-on': langOpen }"
        type="button"
        aria-haspopup="true"
        :aria-expanded="langOpen"
        aria-controls="langMenu"
        :title="t('langBtnTitle')"
        :aria-label="t('langBtnTitle')"
        @click.stop="toggle('langMenu')"
      >
        <AppIcon name="lang" class="ico" />
        <span class="btn-label">{{ langLabel }}</span>
      </button>
      <LangMenu />
    </div>

    <button
      id="statsBtn"
      class="btn btn-icon"
      :class="{ 'is-on': statsOpen }"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="statsOpen"
      aria-controls="statsPanel"
      :title="t('statsBtnTitle')"
      :aria-label="t('statsBtnTitle')"
      @click="toggle('stats')"
    >
      <AppIcon name="stats" />
    </button>

    <button
      id="helpBtn"
      class="btn btn-icon"
      :class="{ 'is-on': helpOpen }"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="helpOpen"
      aria-controls="helpPanel"
      :title="t('helpBtnTitle')"
      :aria-label="t('helpBtnTitle')"
      @click="toggle('help')"
    >
      <AppIcon name="help" />
    </button>

    <button
      id="changelogBtn"
      class="btn btn-icon"
      :class="{ 'is-on': changelogOpen }"
      type="button"
      aria-haspopup="dialog"
      :aria-expanded="changelogOpen"
      aria-controls="changelogPanel"
      :title="t('changelogBtnTitle')"
      :aria-label="t('changelogBtnTitle')"
      @click="toggle('changelog')"
    >
      <AppIcon name="log" />
    </button>

    <a
      id="githubBtn"
      class="btn btn-icon tool-external"
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
      class="btn btn-icon tool-external"
      href="https://wbapp-xx74txuyeotgchq6dlrweb.app.workbuddy.host/?sharecode=BZQLRCGPP5"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WorkBuddy"
      :title="t('workbuddyBtnTitle')"
    >
      <AppIcon name="workbuddy" class="workbuddy-ico" />
    </a>

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
      @click="toggle('settings')"
    >
      <AppIcon name="gear" />
    </button>

    <div class="menu-wrap more-wrap">
      <button
        id="moreBtn"
        class="btn btn-icon"
        :class="{ 'is-on': moreOpen }"
        type="button"
        aria-haspopup="true"
        :aria-expanded="moreOpen"
        aria-controls="moreMenu"
        :title="t('moreTitle')"
        :aria-label="t('moreTitle')"
        @click.stop="toggle('moreMenu')"
      >
        <AppIcon name="more" />
      </button>
      <MoreMenu />
    </div>
  </div>
</template>
