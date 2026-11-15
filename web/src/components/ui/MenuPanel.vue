<script setup lang="ts">
import type { MenuGroup } from "../../lib/menus";
import type { Placement } from "../../lib/overlay";
import type { OverlayKey } from "../../lib/overlayKeys";
import PanelShell from "./PanelShell.vue";
import Tag from "./Tag.vue";

withDefaults(
  defineProps<{
    id: string;
    overlayKey: OverlayKey;
    groups: MenuGroup[];
    triggerId?: string;
    keep?: OverlayKey[];
    placement?: Placement;
    wide?: boolean;
    align?: "end" | "stretch";
    label?: string;
    note?: string;
    activeId?: string;
  }>(),
  { triggerId: "", wide: false, align: "end", label: "", note: "", activeId: "" },
);

const emit = defineEmits<{
  pick: [id: string];
  toggle: [id: string, checked: boolean];
  hide: [];
}>();
</script>

<template>
  <PanelShell
    :id="id"
    :overlay-key="overlayKey"
    kind="menu"
    group="menu"
    role="menu"
    :trigger-id="triggerId"
    :keep="keep"
    :placement="placement || { align: 'end', fit: true }"
    :wide="wide"
    :align="align"
    :label="label"
    @hide="emit('hide')"
  >
    <template v-for="(group, index) in groups" :key="index">
      <div v-if="index" class="menu-sep"></div>
      <div v-if="group.label" class="menu-head">{{ group.label }}</div>
      <p v-if="!group.entries.length" class="empty">{{ group.empty }}</p>
      <template v-for="entry in group.entries" :key="entry.id">
        <label v-if="entry.check" class="row menu-item display-filter-item" :title="entry.title">
          <input
            class="display-filter-check"
            type="checkbox"
            :checked="entry.checked"
            @change="emit('toggle', entry.id, ($event.target as HTMLInputElement).checked)"
          />
          <span class="display-filter-label">{{ entry.label }}</span>
        </label>
        <button
          v-else
          class="row menu-item"
          :class="{ 'is-on': entry.checked || entry.id === activeId }"
          type="button"
          role="menuitem"
          :title="entry.title"
          @click="emit('pick', entry.id)"
        >
          <span class="menu-item-label" :class="{ 'is-emphasis': entry.emphasis }">
            {{ entry.label }}
          </span>
          <span v-if="entry.meta" class="menu-item-meta">{{ entry.meta }}</span>
          <Tag v-if="entry.badge" size="sm" tone="warn">{{ entry.badge }}</Tag>
        </button>
      </template>
    </template>
    <p v-if="note" class="menu-note">{{ note }}</p>
  </PanelShell>
</template>
