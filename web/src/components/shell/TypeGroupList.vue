<script setup lang="ts">
import { t, typeLabel } from "../../i18n";
import { slotsOfGroup } from "../../lib/fontTypes";
import type { FontTarget } from "../../types/font";
import { usePrefsStore } from "../../stores/prefs";
import { useViewStore } from "../../stores/view";

const prefs = usePrefsStore();
const view = useViewStore();

const treeEl = ref<HTMLElement | null>(null);

const summaryOf = (target: FontTarget): string => {
  const style = prefs.resolveEntry(target.scope, target.id);
  if (!style) return "";
  const parts = [
    t(prefs.fontLabelKeyOf(target)),
    `${style.px.toFixed(1)}px`,
    style.lineHeight.toFixed(2),
    `${style.tracking > 0 ? "+" : ""}${style.tracking.toFixed(2)}em`,
    String(style.weight),
  ];
  if (style.italic) parts.push(t("pref.summaryItalic"));
  if (style.caps === "upper") parts.push(t("pref.summaryCapsUpper"));
  if (style.caps === "small") parts.push(t("pref.summaryCapsSmall"));
  if (style.numeric) parts.push(t("pref.summaryNumeric"));
  return parts.join(" · ");
};

const isOn = (target: FontTarget): boolean =>
  view.fontTarget.scope === target.scope && view.fontTarget.id === target.id;

const pick = (target: FontTarget) => {
  view.setFontTarget(target);
};

const ord = (index: number): string => String(index + 1).padStart(2, "0");

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
    <template v-for="group in prefs.presets.groups" :key="group.id">
      <button
        class="type-tree-row is-group"
        :class="{ 'is-on': isOn({ scope: 'group', id: group.id }) }"
        type="button"
        role="treeitem"
        :aria-selected="isOn({ scope: 'group', id: group.id })"
        @click="pick({ scope: 'group', id: group.id })"
      >
        <span class="type-tree-name">{{ t(group.label) }}</span>
        <span class="type-tree-count">{{ slotsOfGroup(group.id).length }}</span>
        <span class="type-tree-summary">{{ summaryOf({ scope: "group", id: group.id }) }}</span>
      </button>
      <button
        v-for="(slot, index) in slotsOfGroup(group.id)"
        :key="slot.id"
        class="type-tree-row is-leaf"
        :class="{ 'is-on': isOn({ scope: 'slot', id: slot.id }) }"
        type="button"
        role="treeitem"
        :aria-selected="isOn({ scope: 'slot', id: slot.id })"
        @click="pick({ scope: 'slot', id: slot.id })"
      >
        <span class="type-tree-ord">{{ ord(index) }}</span>
        <span class="type-tree-name">{{ typeLabel(slot.id) }}</span>
        <span class="type-tree-summary">{{ summaryOf({ scope: "slot", id: slot.id }) }}</span>
      </button>
    </template>
  </div>
</template>
