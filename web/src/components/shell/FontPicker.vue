<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { FOLLOW_BASE, FOLLOW_GROUP } from "../../lib/fontFamilies";
import {
  fontAliases,
  fontMatches,
  fontSearchText,
  fontStackSearch,
  fontTokens,
} from "../../lib/fontSearch";
import { GROUPS, TYPE_SLOTS, groupById, slotById } from "../../lib/fontTypes";
import { overlay } from "../../lib/overlay";
import { fonts } from "../../lib/systemFonts";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import { useScriptStore } from "../../stores/script";
import { useUiStore } from "../../stores/ui";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const store = useScriptStore();
const ui = useUiStore();
const prefs = usePrefsStore();
const view = useViewStore();

type PickerItem = {
  value: string;
  label: string;
  hint: string;
  family?: string;
  search: string;
};

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref("");
const activeIndex = ref(0);

const open = computed(() => overlay.isOpen("fontPicker"));

const target = computed<FontTarget>(() => {
  const current = view.fontTarget;
  if (current.scope === "group") {
    return groupById(current.id) ? current : { scope: "group", id: GROUPS[0].id };
  }
  return slotById(current.id) ? current : { scope: "slot", id: TYPE_SLOTS[0].id };
});

const pickerItems = computed<PickerItem[]>(() => {
  const list: PickerItem[] = [];
  if (target.value.scope === "group") {
    const label = t(prefs.labels.followBase);
    list.push({ value: "@base", label, hint: "", search: fontSearchText(label) });
  } else {
    const label = t(prefs.labels.followGroup);
    list.push({ value: "@group", label, hint: "", search: fontSearchText(label) });
  }
  prefs.presets.fonts.forEach((font) => {
    const label = t(font.label);
    list.push({
      value: font.id,
      label,
      hint: t("fontPresetMeta"),
      search: fontSearchText(font.id, label, fontStackSearch(font.stack)),
    });
  });
  const custom = t(prefs.labels.customFont);
  list.push({ value: "__custom__", label: custom, hint: "", search: fontSearchText(custom) });
  fonts.families().forEach((family) => {
    list.push({
      value: family,
      label: family,
      hint: t("fontSystemMeta"),
      family,
      search: fontSearchText(family, ...fontAliases(family)),
    });
  });
  return list;
});

const visibleItems = computed(() => {
  const tokens = fontTokens(query.value);
  if (!tokens.length) return pickerItems.value;
  return pickerItems.value.filter((item) => fontMatches(item.search, tokens));
});

const currentFont = computed(() => {
  if (target.value.scope === "group") return prefs.groups[target.value.id]?.font || FOLLOW_BASE;
  return prefs.slots[target.value.id]?.font || FOLLOW_GROUP;
});

const isCurrent = (item: PickerItem): boolean => {
  if (item.value === currentFont.value) return true;
  if (item.value !== "__custom__") return false;
  return !pickerItems.value.some((entry) => entry.value === currentFont.value);
};

const currentIndex = (): number => {
  const index = visibleItems.value.findIndex((item) => item.value === currentFont.value);
  if (index >= 0) return index;
  const custom = visibleItems.value.findIndex((item) => item.value === "__custom__");
  return custom >= 0 ? custom : 0;
};

const familyStyle = (family?: string) =>
  family ? { fontFamily: `"${family.replace(/"/g, "")}"` } : undefined;

const patch = (font: string) => {
  if (target.value.scope === "group") {
    prefs.set({ groups: { [target.value.id]: { font } } });
    return;
  }
  prefs.set({ slots: { [target.value.id]: { font } } });
};

const pick = (item: PickerItem) => {
  if (item.value === "__custom__") {
    overlay.close("fontPicker");
    prefs.customFontOpen = true;
    patch("");
    void nextTick(() => byId(UI_IDS.typeFontCustom)?.focus());
    return;
  }
  patch(item.value);
  overlay.close("fontPicker");
  ui.toast(t("fontPicked", { name: item.label }));
};

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
  </div>
</template>
