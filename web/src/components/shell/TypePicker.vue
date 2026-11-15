<script setup lang="ts">
import { t } from "../../i18n";
import { byId, toNeedle } from "../../lib/browser";
import { FOLLOW_BASE, FOLLOW_GROUP } from "../../lib/fontFamilies";
import { GROUPS, TYPE_SLOTS, groupById, slotById, slotsOfGroup } from "../../lib/fontTypes";
import { overlay } from "../../lib/overlay";
import { fonts } from "../../lib/systemFonts";
import type { FontTarget } from "../../types/font";
import { UI_IDS } from "../../ui/ids";
import AppIcon from "../ui/AppIcon.vue";
import EmptyState from "../ui/EmptyState.vue";
import PanelShell from "../ui/PanelShell.vue";
import { useListNav } from "../../composables/useListNav";
import { usePrefsStore } from "../../stores/prefs";
import { useUiStore } from "../../stores/ui";
import { useViewStore } from "../../stores/view";

const props = withDefaults(defineProps<{ kind?: "font" | "group" }>(), { kind: "font" });

type FontItem = {
  value: string;
  label: string;
  hint: string;
  family?: string;
};

const prefs = usePrefsStore();
const ui = useUiStore();
const view = useViewStore();

const searchInput = ref<HTMLInputElement | null>(null);
const query = ref("");

const isFont = computed(() => props.kind === "font");

const panelId = computed(() => (isFont.value ? "fontPicker" : "typeGroupPick"));

const open = computed(() => overlay.isOpen(panelId.value));

const target = computed<FontTarget>(() => {
  const current = view.fontTarget;
  if (current.scope === "group") {
    return groupById(current.id) ? current : { scope: "group", id: GROUPS[0].id };
  }
  return slotById(current.id) ? current : { scope: "slot", id: TYPE_SLOTS[0].id };
});

const currentGroup = computed(() =>
  target.value.scope === "group"
    ? (groupById(target.value.id) ?? GROUPS[0])
    : (groupById(slotById(target.value.id)?.group || "") ?? GROUPS[0]),
);

const currentFont = computed(() => {
  if (target.value.scope === "group") return prefs.groups[target.value.id]?.font || FOLLOW_BASE;
  return prefs.slots[target.value.id]?.font || FOLLOW_GROUP;
});

const fontItems = computed<FontItem[]>(() => {
  const list: FontItem[] = [
    {
      value: target.value.scope === "group" ? FOLLOW_BASE : FOLLOW_GROUP,
      label: t(target.value.scope === "group" ? prefs.labels.followBase : prefs.labels.followGroup),
      hint: "",
    },
  ];
  for (const font of prefs.presets.fonts) {
    list.push({ value: font.id, label: t(font.label), hint: t("fontPresetMeta") });
  }
  list.push({ value: "__custom__", label: t(prefs.labels.customFont), hint: "" });
  for (const family of fonts.families()) {
    list.push({ value: family, label: family, hint: t("fontSystemMeta"), family });
  }
  return list;
});

const visibleFonts = computed(() => {
  const needle = toNeedle(query.value);
  return fontItems.value.filter((item) => !needle || item.label.toLowerCase().indexOf(needle) >= 0);
});

const groupItems = computed(() =>
  GROUPS.map((group) => ({
    id: group.id,
    label: t(group.label),
    count: slotsOfGroup(group.id).length,
    current: group.id === currentGroup.value.id,
  })),
);

const isCurrentFont = (item: FontItem): boolean => {
  if (item.value === currentFont.value) return true;
  if (item.value !== "__custom__") return false;
  return !fontItems.value.some((entry) => entry.value === currentFont.value);
};

const familyStyle = (family?: string) =>
  family ? { fontFamily: `"${family.replace(/"/g, "")}"` } : undefined;

const patchFont = (font: string) => {
  if (target.value.scope === "group") {
    prefs.set({ groups: { [target.value.id]: { font } } });
    return;
  }
  prefs.set({ slots: { [target.value.id]: { font } } });
};

const pickFont = (item: FontItem) => {
  if (item.value === "__custom__") {
    overlay.close(panelId.value);
    prefs.customFontOpen = true;
    patchFont("");
    void nextTick(() => byId(UI_IDS.typeFontCustom)?.focus());
    return;
  }
  patchFont(item.value);
  overlay.close(panelId.value);
  ui.toast("fontPicked", { name: item.label });
};

const pickGroup = (id: string) => {
  view.setFontTarget({ scope: "group", id });
  overlay.close(panelId.value);
};

const nav = useListNav(() => byId(panelId.value), ".picker-item");

watch(open, async (value) => {
  if (!value) return;
  query.value = "";
  await nextTick();
  if (isFont.value) {
    searchInput.value?.focus();
    const job = fonts.ensureFamilies();
    await job;
    return;
  }
  nav.focusCurrent();
});
</script>

<template>
  <PanelShell
    :id="panelId"
    :overlay-key="panelId"
    kind="popover"
    size="sm"
    pad="tight"
    role="listbox"
    :label="isFont ? t('typeFont') : t('pref.groupTitle')"
    :trigger-id="isFont ? UI_IDS.typeFontTrigger : UI_IDS.typeGroupTrigger"
    :placement="
      isFont
        ? { align: 'start', gap: 6, width: 300, fit: true }
        : { align: 'start', gap: 6, matchWidth: true }
    "
    :keep="['settings']"
    :closable="false"
    @keydown="nav.onKeydown"
  >
    <template v-if="isFont" #sub>
      <div class="field-wrap picker-search">
        <AppIcon name="search" class="field-icon" />
        <input
          id="fontPickerSearch"
          ref="searchInput"
          v-model="query"
          class="field"
          data-variant="line"
          type="search"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('fontSearchPlaceholder')"
          :aria-label="t('fontSearchPlaceholder')"
        />
      </div>
    </template>

    <template v-if="isFont">
      <button
        v-for="(item, index) in visibleFonts"
        :key="`${item.value}-${index}`"
        class="row picker-item"
        data-density="compact"
        :class="{ 'is-active': item.value === currentFont }"
        type="button"
        role="option"
        :aria-selected="isCurrentFont(item)"
        @click="pickFont(item)"
      >
        <span class="pi-name" :style="familyStyle(item.family)">{{ item.label }}</span>
        <span v-if="item.hint" class="pi-meta">{{ item.hint }}</span>
        <span class="pi-check" aria-hidden="true">
          <AppIcon v-if="isCurrentFont(item)" name="check" />
        </span>
      </button>
      <EmptyState v-if="!visibleFonts.length" :title="t('fontNoMatch')" />
    </template>

    <template v-else>
      <button
        v-for="item in groupItems"
        :key="item.id"
        class="row picker-item"
        type="button"
        role="option"
        :aria-selected="item.current"
        @click="pickGroup(item.id)"
      >
        <span class="pi-name">{{ item.label }}</span>
        <span class="pi-meta">{{ item.count }}</span>
        <span class="pi-check" aria-hidden="true">
          <AppIcon v-if="item.current" name="check" />
        </span>
      </button>
    </template>
  </PanelShell>
</template>
