<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { slotById } from "../../lib/fontTypes";
import type { CapsMode, FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import ScaleSlider from "./ScaleSlider.vue";
import { usePrefsStore } from "../../stores/prefs";

const props = defineProps<{ target: FontTarget }>();

const prefs = usePrefsStore();

const isSlot = computed(() => props.target.scope === "slot");

const entry = computed(() =>
  isSlot.value ? prefs.slots[props.target.id] : prefs.groups[props.target.id],
);

const resolved = computed(() => prefs.resolveEntry(props.target.scope, props.target.id));

const groupId = computed(() => {
  if (props.target.scope === "group") return props.target.id;
  return slotById(props.target.id)?.group || "";
});

const groupTracking = computed(() => prefs.groups[groupId.value]?.tracking ?? 0);

const fontText = computed(() => t(prefs.fontLabelKeyOf(props.target)));

const showCustom = computed(
  () => prefs.isCustomFont(entry.value?.font || "") || prefs.customFontOpen,
);

const pickerOpen = computed(() => overlay.isOpen("fontPicker"));

const scaleValue = computed(() => entry.value?.scale ?? 100);

const leadingValue = computed(() => entry.value?.leading ?? 100);

const trackingValue = computed(() => resolved.value?.tracking ?? 0);

const scaleText = computed(
  () =>
    `${scaleValue.value}% ${t("parenWrap", { text: `${(resolved.value?.px ?? 0).toFixed(2)}px` })}`,
);

const leadingText = computed(
  () =>
    `${leadingValue.value}% ${t("parenWrap", {
      text: (resolved.value?.lineHeight ?? 0).toFixed(2),
    })}`,
);

const trackingText = computed(() => {
  const value = trackingValue.value;
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}em`;
});

const weightValue = computed(() => entry.value?.weight ?? null);

const italicValue = computed(() => entry.value?.italic ?? null);

const capsValue = computed(() => entry.value?.caps ?? null);

const numericValue = computed(() => entry.value?.numeric ?? null);

const patch = (value: {
  font?: string;
  scale?: number;
  leading?: number;
  tracking?: number;
  weight?: number | null;
  italic?: boolean | null;
  caps?: CapsMode | null;
  numeric?: boolean | null;
}) => {
  if (isSlot.value) prefs.set({ slots: { [props.target.id]: value } });
  else prefs.set({ groups: { [props.target.id]: value } });
};

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

const onCustom = (event: Event) => {
  patch({ font: (event.target as HTMLInputElement).value });
};

const onTracking = (value: number) => {
  const next = isSlot.value ? value - groupTracking.value : value;
  patch({ tracking: Number(next.toFixed(2)) });
};

const weightOptions = computed(() => prefs.presets.weights);

const inheritLabel = computed(() => t("pref.mixGroup"));

const isWeightOn = (value: number | null) => weightValue.value === value;

const capsOptions: { value: CapsMode | null; label: string }[] = [
  { value: null, label: "" },
  { value: "none", label: "pref.capsNone" },
  { value: "upper", label: "pref.capsUpper" },
  { value: "small", label: "pref.capsSmall" },
];

const onCaps = (value: CapsMode | null) => {
  patch({ caps: value });
};
</script>

<template>
  <div class="type-panel">
    <p class="sub-label">{{ t("typeFont") }}</p>
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
      :value="showCustom ? entry?.font || '' : ''"
      :placeholder="t('fontCustomPlaceholder')"
      @input="onCustom"
    />

    <p class="sub-label type-panel-head">{{ t("pref.metrics") }}</p>
    <ScaleSlider
      id="typeScale"
      :label="t('typeScale')"
      :value="scaleValue"
      :text="scaleText"
      :min="prefs.limits.scale.min"
      :max="prefs.limits.scale.max"
      :step="prefs.limits.scale.step"
      @update="(value) => patch({ scale: value })"
    />
    <ScaleSlider
      id="typeLeading"
      :label="t('lineHeight')"
      :value="leadingValue"
      :text="leadingText"
      :min="prefs.limits.leading.min"
      :max="prefs.limits.leading.max"
      :step="prefs.limits.leading.step"
      @update="(value) => patch({ leading: value })"
    />
    <ScaleSlider
      id="typeTracking"
      :label="t('pref.tracking')"
      :value="trackingValue"
      :text="trackingText"
      :min="prefs.limits.tracking.min"
      :max="prefs.limits.tracking.max"
      :step="prefs.limits.tracking.step"
      @update="onTracking"
    />

    <p class="sub-label type-panel-head">{{ t("pref.glyphs") }}</p>
    <p class="sub-label">{{ t("typeWeight") }}</p>
    <div id="weightSeg" class="seg seg-wide settings-weight" role="group">
      <button
        v-if="isSlot"
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': isWeightOn(null) }"
        :aria-pressed="isWeightOn(null)"
        @click="patch({ weight: null })"
      >
        {{ inheritLabel }}
      </button>
      <button
        v-for="value in weightOptions"
        :key="value"
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': isWeightOn(value) }"
        :aria-pressed="isWeightOn(value)"
        @click="patch({ weight: value })"
      >
        {{ value }}
      </button>
    </div>

    <p class="sub-label">{{ t("pref.italic") }}</p>
    <div class="seg seg-wide settings-weight" role="group">
      <button
        v-if="isSlot"
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': italicValue === null }"
        :aria-pressed="italicValue === null"
        @click="patch({ italic: null })"
      >
        {{ inheritLabel }}
      </button>
      <button
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': italicValue === false }"
        :aria-pressed="italicValue === false"
        @click="patch({ italic: false })"
      >
        {{ t("pref.upright") }}
      </button>
      <button
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': italicValue === true }"
        :aria-pressed="italicValue === true"
        @click="patch({ italic: true })"
      >
        {{ t("pref.italicOn") }}
      </button>
    </div>

    <p class="sub-label">{{ t("pref.caps") }}</p>
    <div class="seg seg-wide settings-weight" role="group">
      <button
        v-for="option in capsOptions"
        :key="String(option.value)"
        v-show="isSlot || option.value !== null"
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': capsValue === option.value }"
        :aria-pressed="capsValue === option.value"
        @click="onCaps(option.value)"
      >
        {{ option.value === null ? inheritLabel : t(option.label) }}
      </button>
    </div>

    <p class="sub-label">{{ t("pref.numeric") }}</p>
    <div class="seg seg-wide settings-weight" role="group">
      <button
        v-if="isSlot"
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': numericValue === null }"
        :aria-pressed="numericValue === null"
        @click="patch({ numeric: null })"
      >
        {{ inheritLabel }}
      </button>
      <button
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': numericValue === false }"
        :aria-pressed="numericValue === false"
        @click="patch({ numeric: false })"
      >
        {{ t("pref.numericOff") }}
      </button>
      <button
        class="seg-btn tab"
        type="button"
        :class="{ 'is-on': numericValue === true }"
        :aria-pressed="numericValue === true"
        @click="patch({ numeric: true })"
      >
        {{ t("pref.numeric") }}
      </button>
    </div>
  </div>
</template>
