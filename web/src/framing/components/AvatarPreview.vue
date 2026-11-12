<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { artUrl } from "../api";
import { frameBox } from "../frames";
import { useFramingStore } from "../../stores/framing";

const store = useFramingStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const image = ref<HTMLImageElement | null>(null);
const src = computed(() => (store.current ? artUrl(store.current.artifact.file) : ""));

let pending = 0;

const draw = (): void => {
  const target = canvas.value;
  const source = image.value;
  const current = store.current;
  if (!target || !source || !current) return;
  const [outWidth, outHeight] = store.avatarSize;
  if (target.width !== outWidth) target.width = outWidth;
  if (target.height !== outHeight) target.height = outHeight;
  const context = target.getContext("2d");
  if (!context) return;
  const box = frameBox(current.frame, current.artifact, store.aspect);
  context.clearRect(0, 0, outWidth, outHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    source,
    box.x * source.naturalWidth,
    box.y * source.naturalHeight,
    box.w * source.naturalWidth,
    box.h * source.naturalHeight,
    0,
    0,
    outWidth,
    outHeight,
  );
};

const schedule = (): void => {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    draw();
  });
};

watch(
  src,
  (value) => {
    if (!value) {
      image.value = null;
      return;
    }
    const next = new Image();
    next.decoding = "async";
    next.onload = () => {
      image.value = next;
      schedule();
    };
    next.onerror = () => {
      image.value = null;
    };
    next.src = value;
  },
  { immediate: true },
);

watch(() => [store.current?.frame, store.avatarSize], schedule, { deep: true });

onMounted(schedule);

onBeforeUnmount(() => {
  if (pending) cancelAnimationFrame(pending);
});
</script>

<template>
  <figure class="fx-portrait">
    <div class="fx-portrait-frame">
      <canvas ref="canvas" :width="store.avatarSize[0]" :height="store.avatarSize[1]"></canvas>
      <span v-if="!store.current" class="fx-portrait-empty">no selection</span>
    </div>
    <figcaption class="fx-mono">
      {{ store.avatarSize[0] }}×{{ store.avatarSize[1] }} · mirrored
    </figcaption>
  </figure>
</template>
