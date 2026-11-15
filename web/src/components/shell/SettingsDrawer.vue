<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { GROUPS, firstSlot, groupById, slotById } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import FontPicker from "./FontPicker.vue";
import ScaleSlider from "./ScaleSlider.vue";
import SettingsPreview from "./SettingsPreview.vue";
import TypeGroupList from "./TypeGroupList.vue";
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

const scopeLabel = computed(() => {
  const leaf =
    target.value.scope === "group" ? t(prefs.labels.groupAll) : typeLabel(target.value.id);
  return `${t(group.value.label)} → ${leaf}`;
});

const open = computed(() => overlay.isOpen("settings"));

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

const groupPickOpen = computed(() => overlay.isOpen("typeGroupPick"));

const toggleGroupPick = () => {
  if (overlay.isOpen("typeGroupPick")) {
    overlay.close("typeGroupPick");
    return;
  }
  overlay.open("typeGroupPick", {
    trigger: byId(UI_IDS.typeGroupTrigger),
    keep: ["settings"],
    placement: { align: "start", gap: 6, matchWidth: true },
  });
};

const close = () => {
  overlay.close("typeGroupPick");
  overlay.close("fontPicker");
  overlay.close("settings");
};

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  byId(UI_IDS.typeGroupTrigger)?.focus();
});

watch(target, () => {
  prefs.customFontOpen = false;
});

onMounted(() => {
  overlay.register("settings", {
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
    <header class="drawer-head settings-head">
      <div class="settings-head-text">
        <h2 class="drawer-title settings-title">{{ t("settingsTitle") }}</h2>
        <p class="settings-summary">{{ scopeLabel }}</p>
      </div>
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
        <p class="settings-hint">{{ t("showPortraitsHint") }}</p>
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
  <FontPicker />
</template>
