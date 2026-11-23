<script setup lang="ts">
import { useRovingList } from "../../composables/useRovingList";
import { t } from "../../i18n";
import { GROUPS, groupById, slotsOfGroup } from "../../lib/fontTypes";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const props = defineProps<{ groupId: string }>();

const PANEL = UI_IDS.typeGroupPick;

const panelEl = ref<HTMLElement | null>(null);

const { onKeydown, focusInitial } = useRovingList({
  container: panelEl,
  selector: ".picker-item",
});

const view = useViewStore();

const open = computed(() => popovers.isOpen(PANEL));

const current = computed(() => groupById(props.groupId) || GROUPS[0]);

const items = computed(() =>
  GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    count: slotsOfGroup(group.id).length,
  })),
);

const pick = (id: string) => {
  view.setFontTarget({ scope: "group", id });
  popovers.close(PANEL);
};

watch(open, (value) => {
  if (!value) return;
  void focusInitial('.picker-item[aria-selected="true"]');
});

onMounted(() => {
  popovers.register(PANEL, {
    id: PANEL,
    triggerId: UI_IDS.typeGroupTrigger,
    group: "menu",
    keep: ["settings"],
    placement: { align: "start", gap: 6, matchWidth: true },
  });
});
</script>

<template>
  <div
    :id="PANEL"
    ref="panelEl"
    class="picker popover surface is-anchored"
    role="listbox"
    tabindex="-1"
    :aria-label="t('pref.groupTitle')"
    :hidden="!open"
    @keydown="onKeydown"
  >
    <div class="picker-list popover-list">
      <button
        v-for="item in items"
        :key="item.id"
        class="picker-item row"
        type="button"
        role="option"
        :aria-selected="item.id === current.id"
        @click="pick(item.id)"
      >
        <span class="pi-name">{{ t(item.label) }}</span>
        <span class="pi-meta">{{ item.count }}</span>
        <span class="pi-check" aria-hidden="true">
          <AppIcon v-if="item.id === current.id" name="check" />
        </span>
      </button>
    </div>
  </div>
</template>
