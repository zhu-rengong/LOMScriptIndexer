<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { GROUPS, firstSlot, groupById, slotById, slotsOfGroup } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import FontPicker from "./FontPicker.vue";
import SettingsPreview from "./SettingsPreview.vue";
import { useScriptStore } from "../../stores/script";
import { useUiStore } from "../../stores/ui";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const store = useScriptStore();
const ui = useUiStore();
const prefs = usePrefsStore();
const view = useViewStore();

const WEIGHT_LABELS: Record<number, string> = {
  400: "weightRegular",
  500: "weightMedium",
  600: "weightBold",
};

const target = computed<FontTarget>(() => {
  const current = view.fontTarget;
  if (current.scope === "group") {
    return groupById(current.id) ? current : { scope: "group", id: GROUPS[0].id };
  }
  return slotById(current.id) ? current : { scope: "slot", id: firstSlot().id };
});

const prefState = computed(() => prefs.get());

const prefEntry = computed(() =>
  target.value.scope === "group"
    ? prefState.value.groups[target.value.id]
    : prefState.value.slots[target.value.id],
);

const resolvedEntry = computed(() => prefs.resolveEntry(target.value.scope, target.value.id));

const slotPreset = computed(() =>
  target.value.scope === "slot" ? slotById(target.value.id) : null,
);

const group = computed(() => {
  if (target.value.scope === "group") return groupById(target.value.id);
  const slot = slotById(target.value.id);
  return slot ? groupById(slot.group) : GROUPS[0];
});

const groupSlots = computed(() => (group.value ? slotsOfGroup(group.value.id) : []));

const groupCount = (id: string): number => slotsOfGroup(id).length;

const scopeLabel = computed(() => {
  const name = group.value ? t(group.value.label) : "";
  const leaf =
    target.value.scope === "group" ? t(prefs.labels.groupAll) : typeLabel(target.value.id);
  return name ? `${name} · ${leaf}` : leaf;
});

const fontText = computed(() => t(prefs.fontLabelKeyOf(target.value)));

const isLeadingDisabled = computed(
  () => !!slotPreset.value && !!slotPreset.value.isLeadingDisabled,
);

const scaleValue = computed(() => prefEntry.value?.scale ?? 100);

const leadingValue = computed(() => prefEntry.value?.leading ?? 100);

const weight = computed(() => prefEntry.value?.weight ?? null);

const showCustom = computed(
  () => prefs.isCustomFont(prefEntry.value?.font || "") || prefs.customFontOpen,
);

const open = computed(() => overlay.isOpen("settings"));

const setGroup = (id: string) => {
  view.setFontTarget({ scope: "group", id });
};

const setSlot = (id: string) => {
  view.setFontTarget({ scope: "slot", id });
};

const patch = (value: {
  font?: string;
  scale?: number;
  leading?: number;
  weight?: number | null;
}) => {
  const scope = target.value.scope;
  prefs.set(
    scope === "group"
      ? { groups: { [target.value.id]: value } }
      : { slots: { [target.value.id]: value } },
  );
};

const pickerOpen = computed(() => overlay.isOpen("fontPicker"));

const openPicker = () => {
  if (overlay.isOpen("fontPicker")) {
    overlay.close("fontPicker");
    return;
  }
  overlay.open("fontPicker", {
    trigger: byId(UI_IDS.typeFontTrigger),
    keep: ["settings"],
    placement: { align: "start", gap: 6, width: 300, fit: true },
  });
};

const onScale = (event: Event) => {
  patch({ scale: Number((event.target as HTMLInputElement).value) });
};

const onLeading = (event: Event) => {
  patch({ leading: Number((event.target as HTMLInputElement).value) });
};

const onCustom = (event: Event) => {
  patch({ font: (event.target as HTMLInputElement).value });
};

const setWeight = (value: number | null) => {
  patch({ weight: value });
};

const isWeightOn = (value: number | null) => {
  if (value === null) return !!slotPreset.value && weight.value === null;
  return weight.value !== null && Number(value) === Number(weight.value);
};

const togglePortraits = (value: boolean) => {
  prefs.set({ showPortraits: value });
};

const onPortraitSize = (event: Event) => {
  prefs.set({ portraitSize: Number((event.target as HTMLInputElement).value) });
};

const reset = () => {
  prefs.reset();
  ui.toast(t("toastReset"));
};

const close = () => {
  overlay.close("fontPicker");
  overlay.close("settings");
};

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  byId(UI_IDS.typeFontTrigger)?.focus();
});

watch(target, () => {
  prefs.customFontOpen = false;
});

watch(
  () => prefEntry.value?.font,
  (font) => {
    if (font) prefs.customFontOpen = false;
  },
);

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
        <div class="field-row sub-row" :hidden="!prefs.showPortraits">
          <label class="sub-label" :for="UI_IDS.portraitSize">{{ t("portraitSize") }}</label>
          <output class="field-value">{{ prefs.portraitSize }}px</output>
        </div>
        <input
          :id="UI_IDS.portraitSize"
          class="range"
          type="range"
          :min="prefs.limits.portraitSize.min"
          :max="prefs.limits.portraitSize.max"
          :step="prefs.limits.portraitSize.step"
          :value="prefs.portraitSize"
          :hidden="!prefs.showPortraits"
          :aria-label="t('portraitSize')"
          @input="onPortraitSize"
        />
      </section>

      <section class="settings-section">
        <p class="settings-caption">{{ t("fontTypes") }}</p>
        <div id="typeGroups" class="settings-tabs" role="tablist" :aria-label="t('fontTypes')">
          <button
            v-for="item in prefs.presets.groups"
            :key="item.id"
            class="settings-tab"
            :class="{ 'is-on': !!group && item.id === group.id }"
            type="button"
            role="tab"
            :aria-selected="!!group && item.id === group.id"
            @click="setGroup(item.id)"
          >
            <span class="settings-tab-label">{{ t(item.label) }}</span>
            <span class="settings-tab-count">{{ groupCount(item.id) }}</span>
          </button>
        </div>

        <div
          v-if="group"
          id="typeChips"
          class="type-catalog"
          role="group"
          :aria-label="t('fontTypes')"
        >
          <button
            class="type-row"
            :class="{ 'is-on': target.scope === 'group' }"
            type="button"
            :aria-pressed="target.scope === 'group'"
            @click="setGroup(group.id)"
          >
            <span class="type-row-ord">00</span>
            <span class="type-row-label">{{ t(prefs.labels.groupAll) }}</span>
            <span class="type-row-meta">
              {{ t(prefs.fontLabelKeyOf({ scope: "group", id: group.id })) }}
            </span>
          </button>
          <button
            v-for="(item, index) in groupSlots"
            :key="item.id"
            class="type-row"
            :class="{ 'is-on': target.scope === 'slot' && target.id === item.id }"
            type="button"
            :aria-pressed="target.scope === 'slot' && target.id === item.id"
            @click="setSlot(item.id)"
          >
            <span class="type-row-ord">{{ String(index + 1).padStart(2, "0") }}</span>
            <span class="type-row-label">{{ typeLabel(item.id) }}</span>
            <span class="type-row-meta">
              {{ t(prefs.fontLabelKeyOf({ scope: "slot", id: item.id })) }}
            </span>
          </button>
        </div>

        <div class="type-panel">
          <label class="sub-label">{{ t("typeFont") }}</label>
          <button
            :id="UI_IDS.typeFontTrigger"
            class="btn select font-trigger settings-select"
            type="button"
            aria-haspopup="listbox"
            aria-controls="fontPicker"
            :aria-expanded="pickerOpen"
            @click="openPicker"
          >
            <span class="ft-name">{{ fontText }}</span>
            <AppIcon name="chevron" class="caret" />
          </button>
          <input
            :id="UI_IDS.typeFontCustom"
            class="input input-sm text-input"
            type="text"
            :hidden="!showCustom"
            :value="showCustom ? prefEntry?.font || '' : ''"
            :placeholder="t('fontCustomPlaceholder')"
            @input="onCustom"
          />

          <div class="field-row sub-row">
            <label class="sub-label">{{ t("typeScale") }}</label>
            <output id="typeScaleOut" class="field-value">
              {{ `${scaleValue}% · ${(resolvedEntry?.px ?? 0).toFixed(2)}px` }}
            </output>
          </div>
          <input
            id="typeScale"
            class="range"
            type="range"
            :min="prefs.limits.scale.min"
            :max="prefs.limits.scale.max"
            :step="prefs.limits.scale.step"
            :value="scaleValue"
            :aria-label="t('typeScale')"
            @input="onScale"
          />

          <div class="field-row sub-row" id="typeLeadingRow" :hidden="isLeadingDisabled">
            <label class="sub-label">{{ t("lineHeight") }}</label>
            <output id="typeLeadingOut" class="field-value">
              {{ `${leadingValue}% · ${(resolvedEntry?.lineHeight ?? 0).toFixed(2)}` }}
            </output>
          </div>
          <input
            id="typeLeading"
            class="range"
            type="range"
            :min="prefs.limits.leading.min"
            :max="prefs.limits.leading.max"
            :step="prefs.limits.leading.step"
            :hidden="isLeadingDisabled"
            :value="leadingValue"
            :aria-label="t('lineHeight')"
            @input="onLeading"
          />

          <label class="sub-label">{{ t("typeWeight") }}</label>
          <div class="seg seg-wide settings-weight" id="weightSeg" role="group">
            <button
              class="seg-btn tab"
              type="button"
              :hidden="!slotPreset"
              :class="{ 'is-on': isWeightOn(null) }"
              :aria-pressed="isWeightOn(null)"
              @click="setWeight(null)"
            >
              {{ t("weightInherit") }}
            </button>
            <button
              v-for="value in prefs.presets.weights"
              :key="value"
              class="seg-btn tab"
              type="button"
              :class="{ 'is-on': isWeightOn(value) }"
              :aria-pressed="isWeightOn(value)"
              @click="setWeight(value)"
            >
              {{ t(WEIGHT_LABELS[value]) }}
            </button>
          </div>
        </div>
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

  <FontPicker />
</template>
