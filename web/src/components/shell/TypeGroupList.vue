<script setup lang="ts">
import { useRovingList } from "../../composables/useRovingList";
import { t, tOr, typeLabel } from "../../i18n";
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
  return tOr(key, fontDisplayName(key));
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

const { onKeydown } = useRovingList({
  container: treeEl,
  selector: ".type-tree-row",
});
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
