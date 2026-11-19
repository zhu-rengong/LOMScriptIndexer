<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { popovers } from "../../lib/popover";
import { BASE_TARGET, GROUPS, firstSlot, groupById, slotById } from "../../lib/fontTypes";
import { ensureSystemFonts } from "../../lib/systemFonts";
import type { FontTarget, ThemeMode } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import FontPicker from "./FontPicker.vue";
import ScaleSlider from "./ScaleSlider.vue";
import SettingsPreview from "./SettingsPreview.vue";
import TypeGroupList from "./TypeGroupList.vue";
import TypeFontSetting from "./TypeFontSetting.vue";
import TypeGroupPick from "./TypeGroupPick.vue";
import TypeParamPanel from "./TypeParamPanel.vue";
import { useUiStore } from "../../stores/ui";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const ui = useUiStore();
const prefs = usePrefsStore();
const view = useViewStore();

const target = computed<FontTarget>(() => {
  const current = view.fontTarget;
  if (current.scope === "group") {
    return groupById(current.id) ? current : { scope: "group", id: GROUPS[0].id };
  }
  return slotById(current.id) ? current : { scope: "slot", id: firstSlot().id };
});

const group = computed(() => {
  if (target.value.scope === "group") return groupById(target.value.id) || GROUPS[0];
  const slot = slotById(target.value.id);
  return (slot ? groupById(slot.group) : null) || GROUPS[0];
});

const open = computed(() => popovers.isOpen("settings"));

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "pref.themeLight" },
  { value: "dark", label: "pref.themeDark" },
  { value: "system", label: "pref.themeSystem" },
];

const setTheme = (value: ThemeMode) => {
  prefs.set({ theme: value });
};

const togglePortraits = (value: boolean) => {
  prefs.set({ showPortraits: value });
};

const onPortraitSize = (value: number) => {
  prefs.set({ portraitSize: value });
};

const reset = () => {
  prefs.reset();
  ui.toast(t("toastReset"));
};

const groupPickOpen = computed(() => popovers.isOpen("typeGroupPick"));

const toggleGroupPick = () => {
  if (popovers.isOpen("typeGroupPick")) {
    popovers.close("typeGroupPick");
    return;
  }
  popovers.open("typeGroupPick", {
    trigger: byId(UI_IDS.typeGroupTrigger),
    keep: ["settings"],
    placement: { align: "start", gap: 6, matchWidth: true },
  });
};

const close = () => {
  popovers.close("typeGroupPick");
  popovers.close("fontPicker");
  popovers.close("settings");
};

watch(open, async (value) => {
  if (!value) return;
  void ensureSystemFonts();
  await nextTick();
  byId(UI_IDS.typeGroupTrigger)?.focus();
});

onMounted(() => {
  popovers.register("settings", {
    id: UI_IDS.settingsDrawer,
    triggerId: UI_IDS.settingsBtn,
    group: "sheet",
  });
});
</script>

<template>
  <div id="settingsScrim" class="scrim" :hidden="!open" @click="close"></div>
  <aside
    :id="UI_IDS.settingsDrawer"
    class="drawer surface"
    aria-modal="true"
    role="dialog"
    :aria-label="t('settingsTitle')"
    :hidden="!open"
  >
    <header class="drawer-head">
      <h2 class="drawer-title">{{ t("settingsTitle") }}</h2>
      <button
        id="settingsClose"
        class="btn btn-icon settings-close"
        type="button"
        :title="t('closeTitle')"
        @click="close"
      >
        <AppIcon name="close" />
      </button>
    </header>

    <div class="drawer-body">
      <section class="settings-section">
        <div class="glyph-row theme-row">
          <span class="sub-label">{{ t("pref.theme") }}</span>
          <div class="seg settings-weight" role="group" :aria-label="t('pref.theme')">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              class="seg-btn tab"
              type="button"
              :class="{ 'is-on': prefs.theme === option.value }"
              :aria-pressed="prefs.theme === option.value"
              @click="setTheme(option.value)"
            >
              {{ t(option.label) }}
            </button>
          </div>
        </div>
        <p class="settings-caption">{{ t("readerDisplay") }}</p>
        <label class="settings-switch" :for="UI_IDS.showPortraits">
          <input
            :id="UI_IDS.showPortraits"
            type="checkbox"
            :checked="prefs.showPortraits"
            @change="togglePortraits(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t("showPortraits") }}</span>
        </label>
        <ScaleSlider
          :id="UI_IDS.portraitSize"
          :label="t('portraitSize')"
          :value="prefs.portraitSize"
          :text="`${prefs.portraitSize}px`"
          :min="prefs.limits.portraitSize.min"
          :max="prefs.limits.portraitSize.max"
          :step="prefs.limits.portraitSize.step"
          :disabled="!prefs.showPortraits"
          @update="onPortraitSize"
        />
      </section>

      <section class="settings-section">
        <p class="settings-caption">{{ t("fontTypes") }}</p>
        <TypeFontSetting :target="BASE_TARGET" :label="t('pref.baseFont')" />
        <p class="sub-label type-group-title">{{ t("pref.groupTitle") }}</p>
        <button
          :id="UI_IDS.typeGroupTrigger"
          class="btn select settings-select type-group-pick"
          type="button"
          aria-haspopup="listbox"
          aria-controls="typeGroupPick"
          :aria-expanded="groupPickOpen"
          @click="toggleGroupPick"
        >
          <span class="ft-name">{{ t(group.label) }}</span>
          <AppIcon name="chevron" class="caret" />
        </button>
        <TypeGroupList :target="target" />
        <TypeParamPanel :target="target" />
      </section>

      <section class="settings-section">
        <p class="settings-caption">{{ t("previewTitle") }}</p>
        <SettingsPreview :target="target" />
      </section>
    </div>

    <footer class="drawer-foot">
      <button id="settingsReset" class="btn" type="button" @click="reset">
        {{ t("resetSettings") }}
      </button>
      <button id="settingsDone" class="btn" type="button" @click="close">{{ t("done") }}</button>
    </footer>
  </aside>

  <TypeGroupPick :group-id="group.id" />
  <FontPicker :target="view.pickerTarget" />
</template>
