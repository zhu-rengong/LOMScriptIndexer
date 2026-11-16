<script setup lang="ts">
import { t } from "../../i18n";
import { byId, toNeedle } from "../../lib/browser";
import { overlay } from "../../lib/overlay";
import { fonts } from "../../lib/systemFonts";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useFontSetting } from "../../composables/useFontSetting";
import { usePrefsStore } from "../../stores/prefs";
import { useUiStore } from "../../stores/ui";

const MANUAL = "__manual__";

type PickerItem = {
  value: string;
  label: string;
  hint: string;
  family?: string;
};

const props = defineProps<{ target: FontTarget }>();

const prefs = usePrefsStore();
const ui = useUiStore();
const { current, source, followValue, apply } = useFontSetting(() => props.target);

const searchInput = ref<HTMLInputElement | null>(null);
const manualInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const activeIndex = ref(0);
const manualOpen = ref(false);
const manualValue = ref("");

const open = computed(() => overlay.isOpen("fontPicker"));

const followLabel = computed(() =>
  t(props.target.scope === "group" ? prefs.labels.followBase : prefs.labels.followGroup),
);

const pickerItems = computed<PickerItem[]>(() => {
  const list: PickerItem[] = [
    { value: followValue.value, label: followLabel.value, hint: "" },
    { value: MANUAL, label: t(prefs.labels.customFont), hint: "" },
  ];
  fonts.families().forEach((family) => {
    list.push({ value: family, label: family, hint: t("fontSystemMeta"), family });
  });
  return list;
});

const visibleItems = computed(() => {
  const needle = toNeedle(query.value);
  return pickerItems.value.filter(
    (item) => !needle || item.label.toLowerCase().indexOf(needle) >= 0,
  );
});

const isCurrent = (item: PickerItem): boolean =>
  item.value === MANUAL ? source.value === "manual" : item.value === current.value;

const currentIndex = (): number => {
  const index = visibleItems.value.findIndex((item) => item.value === current.value);
  if (index >= 0) return index;
  if (source.value === "manual") {
    const manual = visibleItems.value.findIndex((item) => item.value === MANUAL);
    if (manual >= 0) return manual;
  }
  return 0;
};

const familyStyle = (family?: string) =>
  family ? { fontFamily: `"${family.replace(/"/g, "")}"` } : undefined;

const openManual = async () => {
  const first = !manualOpen.value;
  if (first) {
    manualValue.value = source.value === "system" || source.value === "manual" ? current.value : "";
    manualOpen.value = true;
  }
  await nextTick();
  manualInput.value?.focus();
  if (first) manualInput.value?.select();
};

const applyManual = () => {
  const value = manualValue.value.trim();
  if (!value) return;
  apply(value);
  overlay.close("fontPicker");
  ui.toast(t("fontPicked", { name: value }));
};

const pick = (item: PickerItem) => {
  if (item.value === MANUAL) {
    void openManual();
    return;
  }
  apply(item.value);
  overlay.close("fontPicker");
  ui.toast(t("fontPicked", { name: item.label }));
};

const fontHint = computed(() => {
  switch (fonts.status()) {
    case "file":
      return t("fontFileProtocolHint");
    case "unsupported":
      return t("fontUnsupportedHint");
    case "insecure":
      return t("fontInsecureHint");
    case "denied":
      return t("fontDeniedHint");
    case "blocked":
      return t("fontBlockedHint");
    case "empty":
      return t("fontEmptyHint");
    case "loading":
      return t("fontLoadingHint");
    case "timeout":
      return t("fontTimeoutHint");
    default:
      return "";
  }
});

const close = () => overlay.close("fontPicker");

const move = (step: number) => {
  if (!visibleItems.value.length) return;
  activeIndex.value =
    (activeIndex.value + step + visibleItems.value.length) % visibleItems.value.length;
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === "Escape") {
    close();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    move(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    move(-1);
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    const item = visibleItems.value[activeIndex.value];
    if (item) pick(item);
  }
};

watch(open, async (value) => {
  if (!value) return;
  query.value = "";
  manualOpen.value = false;
  manualValue.value = "";
  const job = fonts.ensureFamilies();
  await nextTick();
  const initial = currentIndex();
  activeIndex.value = initial;
  searchInput.value?.focus();
  await job;
  await nextTick();
  if (open.value && !query.value && activeIndex.value === initial) {
    activeIndex.value = currentIndex();
  }
});

watch(visibleItems, () => {
  if (activeIndex.value >= visibleItems.value.length) activeIndex.value = 0;
});

watch(activeIndex, async () => {
  await nextTick();
  const list = byId(UI_IDS.fontPickerList);
  const row = list
    ? (list.querySelectorAll(".picker-item")[activeIndex.value] as HTMLElement | undefined)
    : undefined;
  if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
});

onMounted(() => {
  overlay.register("fontPicker", {
    id: "fontPicker",
    group: "menu",
    keep: ["settings"],
    placement: { align: "start", gap: 6, width: 300, fit: true },
  });
});
</script>

<template>
  <div
    id="fontPicker"
    class="picker popover surface"
    role="listbox"
    :aria-label="t('typeFont')"
    :hidden="!open"
  >
    <div class="picker-search">
      <AppIcon name="search" />
      <input
        id="fontPickerSearch"
        ref="searchInput"
        v-model="query"
        class="input"
        type="search"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('fontSearchPlaceholder')"
        :aria-label="t('fontSearchPlaceholder')"
        @keydown="onKeydown"
      />
    </div>
    <div v-if="manualOpen" class="picker-manual">
      <input
        ref="manualInput"
        v-model="manualValue"
        class="input"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :placeholder="t('fontCustomPlaceholder')"
        :aria-label="t('fontCustomPlaceholder')"
        @keydown.enter.prevent="applyManual"
      />
    </div>
    <div id="fontPickerList" class="picker-list popover-list">
      <template v-if="visibleItems.length">
        <button
          v-for="(item, index) in visibleItems"
          :key="`${item.value}-${index}`"
          class="picker-item row"
          :class="{ 'is-active': index === activeIndex }"
          type="button"
          role="option"
          :aria-selected="isCurrent(item)"
          @click="pick(item)"
        >
          <span class="pi-name" :style="familyStyle(item.family)">
            {{ item.label }}
          </span>
          <span v-if="item.hint" class="pi-meta">{{ item.hint }}</span>
          <span class="pi-check" aria-hidden="true">
            <AppIcon v-if="isCurrent(item)" name="check" />
          </span>
        </button>
      </template>
      <div v-else class="picker-empty popover-empty">{{ t("fontNoMatch") }}</div>
    </div>
    <p v-if="fontHint" class="panel-hint">{{ fontHint }}</p>
  </div>
</template>
