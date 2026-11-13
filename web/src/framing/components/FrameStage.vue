<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Frame } from "../frames";
import { MIN_WIDTH, clamp, frameBox } from "../frames";
import { artUrl } from "../api";
import { useFramingStore } from "../../stores/framing";

type Drag = { id: number; x: number; y: number; rect: DOMRect; frame: Frame };

const store = useFramingStore();
const viewport = ref<HTMLElement | null>(null);
const plate = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });
const dragging = ref(false);
const loaded = ref(false);

let drag: Drag | null = null;
let observer: ResizeObserver | null = null;

onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) size.value = { width: rect.width, height: rect.height };
  });
  if (viewport.value) observer.observe(viewport.value);
});

onBeforeUnmount(() => observer?.disconnect());

const active = computed(() => store.current);
const src = computed(() => (active.value ? artUrl(active.value.artifact.file) : ""));

watch(src, () => {
  loaded.value = false;
});

const plateSize = computed(() => {
  const artifact = active.value?.artifact;
  if (!artifact) return { width: 0, height: 0 };
  const [width, height] = artifact.size;
  const roomWidth = Math.max(0, size.value.width);
  const roomHeight = Math.max(0, size.value.height);
  if (!width || !height || !roomWidth || !roomHeight) return { width: 0, height: 0 };
  const scale = Math.min(roomWidth / width, roomHeight / height, 1);
  return { width: width * scale, height: height * scale };
});

const box = computed(() =>
  active.value ? frameBox(active.value.frame, active.value.artifact, store.aspect) : null,
);

const defaultBox = computed(() =>
  active.value
    ? frameBox(active.value.artifact.default, active.value.artifact, store.aspect)
    : null,
);

const percent = (value: number): string => `${value * 100}%`;

const frameStyle = computed(() => {
  const current = box.value;
  if (!current) return {};
  return {
    left: percent(current.x),
    top: percent(current.y),
    width: percent(current.w),
    height: percent(current.h),
  };
});

const defaultStyle = computed(() => {
  const current = defaultBox.value;
  if (!current) return {};
  return {
    left: percent(current.x),
    top: percent(current.y),
    width: percent(current.w),
    height: percent(current.h),
  };
});

const zoomLabel = computed(() => {
  const current = active.value;
  if (!current) return "";
  return `${(current.artifact.default.w / current.frame.w).toFixed(2)}×`;
});

const onPointerDown = (event: PointerEvent): void => {
  if (event.button !== 0) return;
  const element = plate.value;
  const current = active.value;
  if (!element || !current) return;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    rect: element.getBoundingClientRect(),
    frame: { ...current.frame },
  };
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent): void => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = (event.clientX - drag.x) / drag.rect.width;
  const dy = (event.clientY - drag.y) / drag.rect.height;
  store.setFrame({ x: drag.frame.x + dx, y: drag.frame.y + dy, w: drag.frame.w });
};

const onPointerUp = (event: PointerEvent): void => {
  if (drag && event.pointerId === drag.id) {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  }
  drag = null;
  dragging.value = false;
};

const onWheel = (event: WheelEvent): void => {
  const element = plate.value;
  const current = active.value;
  if (!element || !current) return;
  event.preventDefault();
  const rect = element.getBoundingClientRect();
  const anchorX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const anchorY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const speed = event.shiftKey ? 0.0006 : 0.002;
  const width = clamp(current.frame.w * Math.exp(-event.deltaY * speed), MIN_WIDTH, store.maxWidth);
  const ratio = width / current.frame.w;
  store.setFrame({
    x: anchorX - (anchorX - current.frame.x) * ratio,
    y: anchorY - (anchorY - current.frame.y) * ratio,
    w: width,
  });
};
</script>

<template>
  <section class="fx-stage" @wheel.prevent="onWheel">
    <header v-if="active" class="fx-stage-head">
      <span class="fx-stage-title">
        <strong>{{ active.label }}</strong>
        <span class="fx-stage-expr">{{ active.expression }}</span>
      </span>
      <span class="fx-stage-meta fx-mono">
        {{ active.artifact.size[0] }}×{{ active.artifact.size[1] }}, {{ zoomLabel }}
      </span>
    </header>

    <div ref="viewport" class="fx-stage-view">
      <div
        v-if="active && plateSize.width"
        ref="plate"
        class="fx-plate"
        :class="{ 'is-loaded': loaded }"
        :style="{ width: `${plateSize.width}px`, height: `${plateSize.height}px` }"
      >
        <img class="fx-plate-img" :src="src" alt="" draggable="false" @load="loaded = true" />
        <span class="fx-band" :style="{ top: `${store.headBand * 100}%` }">
          <i class="fx-band-tag fx-mono">head band</i>
        </span>
        <span class="fx-plate-thirds" aria-hidden="true"></span>
        <span v-if="defaultBox" class="fx-default" :style="defaultStyle">
          <i class="fx-default-tag fx-mono">default</i>
        </span>

        <div
          class="fx-frame"
          :class="{ 'is-dragging': dragging }"
          :style="frameStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <span class="fx-frame-grid" aria-hidden="true"></span>
          <span class="fx-handle is-tl" aria-hidden="true"></span>
          <span class="fx-handle is-tr" aria-hidden="true"></span>
          <span class="fx-handle is-bl" aria-hidden="true"></span>
          <span class="fx-handle is-br" aria-hidden="true"></span>
          <span class="fx-frame-tag fx-mono">{{ (active.frame.w * 100).toFixed(1) }}%</span>
        </div>
      </div>

      <div v-else-if="active" class="fx-plate-skeleton" aria-hidden="true"></div>

      <div v-else class="fx-stage-empty">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="6" y="6" width="36" height="36" rx="3" />
          <path d="M16 18h16M16 26h10" />
          <circle cx="32" cy="30" r="5" />
        </svg>
        <p>Select an expression to start framing</p>
        <small>Drag the frame to pan; scroll to zoom</small>
      </div>
    </div>

    <footer class="fx-stage-foot fx-mono">
      <span>drag pan</span>
      <span class="fx-sep">/</span>
      <span>wheel zoom</span>
      <span class="fx-sep">/</span>
      <span>shift fine</span>
      <span class="fx-sep">/</span>
      <span>R reset</span>
    </footer>
  </section>
</template>
