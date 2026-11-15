<script setup lang="ts">
import { overlay, type Placement } from "../../lib/overlay";
import type { OverlayKey } from "../../lib/overlayKeys";
import PanelHead from "./PanelHead.vue";

const props = withDefaults(
  defineProps<{
    id: string;
    overlayKey: OverlayKey;
    kind?: "menu" | "popover" | "dialog" | "drawer";
    size?: "sm" | "md" | "lg";
    title?: string;
    summary?: string;
    headingId?: string;
    label?: string;
    triggerId?: string;
    group?: string;
    keep?: OverlayKey[];
    autofocus?: string;
    placement?: Placement;
    role?: string;
    modal?: boolean;
    closeTitle?: string;
    closable?: boolean;
    closeId?: string;
    wide?: boolean;
    align?: "end" | "stretch";
    pad?: "none" | "tight" | "default";
  }>(),
  {
    kind: "popover",
    size: "md",
    title: "",
    summary: "",
    headingId: "",
    label: "",
    triggerId: "",
    group: "pop",
    autofocus: "",
    role: "dialog",
    modal: false,
    closeTitle: "Close",
    closable: true,
    closeId: "",
    wide: false,
    align: "end",
    pad: "default",
  },
);

const emit = defineEmits<{ hide: []; close: []; scroll: [event: Event] }>();

const open = computed(() => overlay.isOpen(props.overlayKey));

const rootClass = computed(() => {
  if (props.kind === "menu") return ["panel", "menu"];
  if (props.kind === "drawer") return ["panel", "panel-drawer", "surface"];
  if (props.kind === "dialog") return ["panel", "panel-dialog", "surface", "popover"];
  return ["panel", "panel-pop", "surface", "popover"];
});

const close = () => {
  emit("close");
  overlay.close(props.overlayKey);
};

onMounted(() => {
  overlay.register(props.overlayKey, {
    id: props.id,
    triggerId: props.triggerId || undefined,
    group: props.group,
    keep: props.keep,
    autofocus: props.autofocus || undefined,
    placement: props.placement,
    onHide: () => emit("hide"),
  });
});

onBeforeUnmount(() => {
  overlay.unregister(props.overlayKey);
});
</script>

<template>
  <component
    :is="kind === 'menu' ? 'div' : 'aside'"
    :id="id"
    :class="[rootClass, { 'menu-wide': kind === 'menu' && wide }]"
    :role="kind === 'menu' ? 'menu' : role"
    :aria-modal="kind === 'menu' ? undefined : modal ? 'true' : undefined"
    :aria-label="label || (!headingId && title ? title : undefined)"
    :aria-labelledby="headingId || undefined"
    :data-size="size"
    :data-align="align"
    :data-pad="pad"
    :hidden="!open"
  >
    <PanelHead
      v-if="title || $slots.head"
      :title="title"
      :summary="summary"
      :heading-id="headingId"
      :close-id="closeId"
      :close-title="closeTitle"
      :closable="closable && kind !== 'menu'"
      @close="close"
    >
      <slot name="head" />
    </PanelHead>

    <slot name="sub" />

    <div
      v-if="kind === 'menu'"
      class="menu-list popover-list"
      @scroll.passive="emit('scroll', $event)"
    >
      <slot />
    </div>
    <div v-else class="panel-body" @scroll.passive="emit('scroll', $event)">
      <slot />
    </div>

    <p v-if="$slots.hint" class="panel-hint"><slot name="hint" /></p>
    <footer v-if="$slots.foot" class="panel-foot"><slot name="foot" /></footer>
  </component>
</template>
