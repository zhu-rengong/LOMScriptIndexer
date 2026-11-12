<script setup lang="ts">
import { computed } from "vue";
import AvatarPreview from "./AvatarPreview.vue";
import type { Frame } from "../frames";
import { MIN_WIDTH, clamp, frameBox, sameFrame } from "../frames";
import { useFramingStore } from "../../stores/framing";

const store = useFramingStore();

const active = computed(() => store.current);
const customized = computed(() =>
  active.value ? !sameFrame(active.value.frame, active.value.artifact.default) : false,
);

const format = (value: number): string => (value * 100).toFixed(2);

const defaultText = computed(() => {
  const artifact = active.value?.artifact;
  if (!artifact) return "—";
  const { x, y, w } = artifact.default;
  return `${format(x)} / ${format(y)} / ${format(w)}`;
});

const artworkText = computed(() => {
  const artifact = active.value?.artifact;
  return artifact ? `${artifact.size[0]}×${artifact.size[1]}` : "—";
});

const zoomText = computed(() => {
  const current = active.value;
  if (!current) return "—";
  return `${(current.artifact.default.w / current.frame.w).toFixed(2)}×`;
});

const sliderValue = computed(() => {
  const current = active.value;
  if (!current) return 0;
  const min = Math.log(MIN_WIDTH);
  const max = Math.log(store.maxWidth);
  const span = Math.max(0.000001, max - min);
  return Math.round(((Math.log(current.frame.w) - min) / span) * 1000);
});

const onAxis = (axis: "x" | "y" | "w", event: Event): void => {
  const input = event.target as HTMLInputElement;
  const current = active.value;
  const value = Number(input.value);
  if (!current) return;
  if (!Number.isFinite(value)) {
    input.value = format(current.frame[axis]);
    return;
  }
  const next: Frame = { x: current.frame.x, y: current.frame.y, w: current.frame.w };
  next[axis] = value / 100;
  store.setFrame(next);
  input.value = format(store.current?.frame[axis] ?? current.frame[axis]);
};

const onSlider = (event: Event): void => {
  const current = active.value;
  if (!current) return;
  const ratio = Number((event.target as HTMLInputElement).value) / 1000;
  const min = Math.log(MIN_WIDTH);
  const max = Math.log(store.maxWidth);
  const width = Math.exp(min + (max - min) * ratio);
  const box = frameBox(current.frame, current.artifact, store.aspect);
  const scale = width / current.frame.w;
  const centerX = box.x + box.w / 2;
  const centerY = box.y + box.h / 2;
  store.setFrame({
    x: centerX - (box.w * scale) / 2,
    y: centerY - (box.h * scale) / 2,
    w: clamp(width, MIN_WIDTH, store.maxWidth),
  });
};
</script>

<template>
  <aside class="fx-panel fx-inspector">
    <header class="fx-inspector-head">
      <h2>Framing</h2>
      <span v-if="active" class="fx-chip" :class="{ 'is-warn': customized }">
        {{ customized ? "custom" : "default" }}
      </span>
    </header>

    <AvatarPreview />

    <div class="fx-fields">
      <label class="fx-field">
        <span>Left</span>
        <span class="fx-field-input">
          <input
            type="number"
            step="0.1"
            :disabled="!active"
            :value="active ? format(active.frame.x) : ''"
            @change="onAxis('x', $event)"
          />
          <i>%</i>
        </span>
      </label>
      <label class="fx-field">
        <span>Top</span>
        <span class="fx-field-input">
          <input
            type="number"
            step="0.1"
            :disabled="!active"
            :value="active ? format(active.frame.y) : ''"
            @change="onAxis('y', $event)"
          />
          <i>%</i>
        </span>
      </label>
      <label class="fx-field">
        <span>Width</span>
        <span class="fx-field-input">
          <input
            type="number"
            step="0.1"
            :disabled="!active"
            :value="active ? format(active.frame.w) : ''"
            @change="onAxis('w', $event)"
          />
          <i>%</i>
        </span>
      </label>
    </div>

    <div class="fx-zoom">
      <div class="fx-zoom-head">
        <span>Zoom</span>
        <strong class="fx-mono">{{ zoomText }}</strong>
      </div>
      <input
        class="fx-range"
        type="range"
        min="0"
        max="1000"
        step="1"
        :disabled="!active"
        :value="sliderValue"
        @input="onSlider"
      />
      <div class="fx-zoom-scale fx-mono">
        <span>tight</span>
        <span>wide</span>
      </div>
    </div>

    <div class="fx-actions">
      <button type="button" class="fx-btn" :disabled="!active" @click="store.resetFrame()">
        Reset to default
      </button>
      <button
        type="button"
        class="fx-btn is-primary"
        :disabled="!active"
        @click="store.applyToCharacter()"
      >
        Apply to all expressions
      </button>
    </div>

    <dl class="fx-meta">
      <div>
        <dt>Default</dt>
        <dd class="fx-mono">{{ defaultText }}</dd>
      </div>
      <div>
        <dt>Artwork</dt>
        <dd class="fx-mono">{{ artworkText }}</dd>
      </div>
      <div>
        <dt>Output</dt>
        <dd class="fx-mono">{{ store.avatarSize[0] }}×{{ store.avatarSize[1] }}</dd>
      </div>
    </dl>

    <ul class="fx-keys">
      <li><kbd>drag</kbd><span>pan the frame</span></li>
      <li><kbd>wheel</kbd><span>zoom at cursor</span></li>
      <li><kbd>arrows</kbd><span>nudge · shift coarse</span></li>
      <li><kbd>+ / −</kbd><span>step zoom</span></li>
      <li><kbd>R</kbd><span>reset to default</span></li>
    </ul>
  </aside>
</template>
