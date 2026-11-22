<script setup lang="ts">
import { t } from "../../i18n";
import { byId } from "../../lib/browser";
import { GROUPS, groupById, slotsOfGroup } from "../../lib/fontTypes";
import { popovers } from "../../lib/popover";
import { UI_IDS } from "../../ui/ids";

const props = defineProps<{ groupId: string }>();

const PANEL = "typeGroupPick";

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

const onKeydown = (event: KeyboardEvent) => {
  if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(event.key) < 0) return;
  const host = byId(PANEL);
  if (!host) return;
  const list = Array.from(host.querySelectorAll<HTMLButtonElement>(".picker-item"));
  const index = list.indexOf(document.activeElement as HTMLButtonElement);
  if (index < 0) return;
  event.preventDefault();
  let next = index;
  if (event.key === "ArrowDown") next = Math.min(list.length - 1, index + 1);
  if (event.key === "ArrowUp") next = Math.max(0, index - 1);
  if (event.key === "Home") next = 0;
  if (event.key === "End") next = list.length - 1;
  list[next]?.focus();
};

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  const host = byId(PANEL);
  const node =
    host?.querySelector<HTMLButtonElement>('.picker-item[aria-selected="true"]') ||
    host?.querySelector<HTMLButtonElement>(".picker-item");
  node?.focus();
});

onMounted(() => {
  popovers.register(PANEL, {
    id: PANEL,
    triggerId: UI_IDS.typeGroupTrigger,
    group: "menu",
    keep: ["settings"],
    float: true,
    placement: { align: "start", gap: 6, matchWidth: true },
  });
});
</script>

<template>
  <div
    :id="PANEL"
    class="picker popover surface"
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
