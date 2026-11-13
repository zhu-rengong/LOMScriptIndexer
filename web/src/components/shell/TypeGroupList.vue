<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { GROUPS, groupById, slotById, slotsOfGroup } from "../../lib/fontTypes";
import type { FontScope, FontTarget } from "../../types/font";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

type TreeMetrics = {
  face: string;
  size: string;
};

type TreeRow = {
  key: string;
  scope: FontScope;
  id: string;
  label: string;
  ord: string;
  count: number | null;
  metrics: TreeMetrics | null;
};

const props = defineProps<{ target: FontTarget }>();

const prefs = usePrefsStore();
const view = useViewStore();

const treeEl = ref<HTMLElement | null>(null);

const faceOf = (target: FontTarget): string => {
  const key = prefs.fontLabelKeyOf(target);
  const following = key === prefs.labels.followBase || key === prefs.labels.followGroup;
  return t(following ? "pref.followShort" : key);
};

const metricsOf = (target: FontTarget): TreeMetrics | null => {
  const style = prefs.resolveEntry(target.scope, target.id);
  if (!style) return null;
  return {
    face: faceOf(target),
    size: `${style.px.toFixed(1)}px`,
  };
};

const groupId = computed(() =>
  props.target.scope === "group"
    ? props.target.id
    : slotById(props.target.id)?.group || GROUPS[0].id,
);

const current = computed(() => groupById(groupId.value) || GROUPS[0]);

const rows = computed<TreeRow[]>(() => {
  const group = current.value;
  const slots = slotsOfGroup(group.id);
  const out: TreeRow[] = [
    {
      key: group.id,
      scope: "group",
      id: group.id,
      label: t(prefs.labels.groupAll),
      ord: "00",
      count: slots.length,
      metrics: metricsOf({ scope: "group", id: group.id }),
    },
  ];
  slots.forEach((slot, index) => {
    out.push({
      key: slot.id,
      scope: "slot",
      id: slot.id,
      label: typeLabel(slot.id),
      ord: String(index + 1).padStart(2, "0"),
      count: null,
      metrics: metricsOf({ scope: "slot", id: slot.id }),
    });
  });
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
      :class="{ 'is-on': isOn(row), 'is-group': row.scope === 'group' }"
      type="button"
      role="treeitem"
      :aria-selected="isOn(row)"
      @click="pick(row)"
    >
      <span class="type-tree-ord" aria-hidden="true">{{ row.ord }}</span>
      <span class="type-tree-name">
        <span class="type-tree-label">{{ row.label }}</span>
        <span v-if="row.count !== null" class="type-tree-count">{{ row.count }}</span>
      </span>
      <span v-if="row.metrics" class="type-tree-metrics">
        <span class="type-tree-face" :title="t('typeFont')">{{ row.metrics.face }}</span>
        <span class="type-tree-size" :title="t('typeScale')">{{ row.metrics.size }}</span>
      </span>
    </button>
  </div>
</template>
