<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { slotsOfGroup } from "../../lib/fontTypes";
import type { FontScope, FontTarget } from "../../types/font";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

type TreeMetrics = {
  face: string;
  size: string;
  leading: string;
  tracking: string;
  weight: string;
  marks: string;
  marksTitle: string;
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

const prefs = usePrefsStore();
const view = useViewStore();

const treeEl = ref<HTMLElement | null>(null);

const metricsOf = (target: FontTarget): TreeMetrics | null => {
  const style = prefs.resolveEntry(target.scope, target.id);
  if (!style) return null;
  const marks: string[] = [];
  const names: string[] = [];
  if (style.italic) {
    marks.push("i");
    names.push(t("pref.summaryItalic"));
  }
  if (style.caps === "upper") {
    marks.push("A");
    names.push(t("pref.summaryCapsUpper"));
  }
  if (style.caps === "small") {
    marks.push("S");
    names.push(t("pref.summaryCapsSmall"));
  }
  if (style.numeric) {
    marks.push("T");
    names.push(t("pref.summaryNumeric"));
  }
  return {
    face: t(prefs.resolvedFontKey(target)),
    size: `${style.px.toFixed(1)}px`,
    leading: style.lineHeight.toFixed(2),
    tracking: `${style.tracking > 0 ? "+" : ""}${style.tracking.toFixed(2)}em`,
    weight: String(style.weight),
    marks: marks.join(""),
    marksTitle: names.join(" · "),
  };
};

const rows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = [];
  for (const group of prefs.presets.groups) {
    const slots = slotsOfGroup(group.id);
    out.push({
      key: group.id,
      scope: "group",
      id: group.id,
      label: t(group.label),
      ord: "",
      count: slots.length,
      metrics: metricsOf({ scope: "group", id: group.id }),
    });
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
  }
  return out;
});

const isOn = (row: TreeRow): boolean =>
  view.fontTarget.scope === row.scope && view.fontTarget.id === row.id;

const pick = (row: TreeRow) => {
  view.setFontTarget({ scope: row.scope, id: row.id });
};

const onKeydown = (event: KeyboardEvent) => {
  if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) < 0) return;
  const host = treeEl.value;
  if (!host) return;
  const items = Array.from(host.querySelectorAll<HTMLButtonElement>(".type-tree-row"));
  const current = items.indexOf(document.activeElement as HTMLButtonElement);
  if (current < 0) return;
  event.preventDefault();
  let next = current;
  if (event.key === "ArrowDown") next = Math.min(items.length - 1, current + 1);
  if (event.key === "ArrowUp") next = Math.max(0, current - 1);
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
        <span class="type-tree-face" :title="row.metrics.face">{{ row.metrics.face }}</span>
        <span class="type-tree-size" :title="t('typeScale')">{{ row.metrics.size }}</span>
        <span class="type-tree-leading" :title="t('lineHeight')">{{ row.metrics.leading }}</span>
        <span class="type-tree-tracking" :title="t('pref.tracking')">
          {{ row.metrics.tracking }}
        </span>
        <span class="type-tree-weight" :title="t('typeWeight')">{{ row.metrics.weight }}</span>
        <span class="type-tree-marks" :title="row.metrics.marksTitle || t('pref.glyphs')">
          {{ row.metrics.marks }}
        </span>
      </span>
    </button>
  </div>
</template>
