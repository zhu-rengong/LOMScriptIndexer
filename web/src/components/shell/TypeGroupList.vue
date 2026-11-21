<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { FOLLOW_BASE, FOLLOW_GROUP, fontLabelKey } from "../../lib/fontFamilies";
import { GROUPS, groupById, slotById, slotsOfGroup } from "../../lib/fontTypes";
import { fontDisplayName } from "../../lib/systemFonts";
import type { FontScope, FontTarget } from "../../types/font";

type TreeRow = {
  key: string;
  scope: FontScope;
  id: string;
  label: string;
  font: string;
};

const props = defineProps<{ target: FontTarget }>();

const prefs = usePrefsStore();
const view = useViewStore();

const treeEl = ref<HTMLElement | null>(null);

const groupId = computed(() =>
  props.target.scope === "group"
    ? props.target.id
    : slotById(props.target.id)?.group || GROUPS[0].id,
);

const current = computed(() => groupById(groupId.value) || GROUPS[0]);

const fontText = (scope: FontScope, id: string): string => {
  const value = scope === "group" ? prefs.groups[id]?.font : prefs.slots[id]?.font;
  if (!value || value === FOLLOW_BASE || value === FOLLOW_GROUP) return t("pref.followShort");
  const key = fontLabelKey(value);
  const text = t(key);
  return text === key ? fontDisplayName(key) : text;
};

const rows = computed<TreeRow[]>(() => {
  const group = current.value;
  const out: TreeRow[] = [
    {
      key: group.id,
      scope: "group",
      id: group.id,
      label: t(prefs.labels.groupAll),
      font: fontText("group", group.id),
    },
  ];
  for (const slot of slotsOfGroup(group.id)) {
    out.push({
      key: slot.id,
      scope: "slot",
      id: slot.id,
      label: typeLabel(slot.id),
      font: fontText("slot", slot.id),
    });
  }
  return out;
});

const isOn = (row: TreeRow): boolean =>
  props.target.scope === row.scope && props.target.id === row.id;

const pick = (row: TreeRow) => {
  view.setFontTarget({ scope: row.scope, id: row.id });
};

const onKeydown = (event: KeyboardEvent) => {
  if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) < 0) return;
  const host = treeEl.value;
  if (!host) return;
  const items = Array.from(host.querySelectorAll<HTMLButtonElement>(".type-tree-row"));
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowDown") next = Math.min(items.length - 1, index + 1);
  if (event.key === "ArrowUp") next = Math.max(0, index - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = items.length - 1;
  items[next]?.focus();
};
</script>

<template>
  <div ref="treeEl" class="type-tree" role="tree" @keydown="onKeydown">
    <button
      v-for="row in rows"
      :key="row.key"
      class="type-tree-row"
      :class="{ 'is-on': isOn(row) }"
      type="button"
      role="treeitem"
      :aria-selected="isOn(row)"
      @click="pick(row)"
    >
      <span class="type-tree-label">{{ row.label }}</span>
      <span class="type-tree-font">{{ row.font }}</span>
    </button>
  </div>
</template>
