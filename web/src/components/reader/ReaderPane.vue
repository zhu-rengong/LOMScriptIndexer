<script setup lang="ts">
import { createGripController } from "../../composables/grip";
import { t } from "../../i18n";
import { byId } from "../../lib/dom";
import { UI_IDS } from "../../ui/ids";

const store = useScriptStore();
const prefs = usePrefsStore();

const reader = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const rail = ref<HTMLElement | null>(null);

const grip = createGripController(reader, stage, rail);

const open = computed(() => !!store.selected());

const onGripDown = (edge: "left" | "right", event: PointerEvent) => {
  grip.start(edge, event);
};

const onGripKey = (event: KeyboardEvent) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  grip.nudge(event.key === "ArrowRight" ? 20 : -20);
};

onMounted(() => {
  stage.value = byId(UI_IDS.main);
  rail.value = byId(UI_IDS.chapterRail);
  grip.applyMeasure(prefs.get().measure);
});
</script>

<template>
  <section id="reader" ref="reader" :class="{ 'is-open': open }" aria-live="polite">
    <ReaderHeader />
    <ReaderBody />
    <div
      class="reader-grip"
      data-edge="left"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :title="t('gripTitle')"
      @pointerdown="onGripDown('left', $event)"
      @dblclick="grip.reset()"
      @keydown="onGripKey"
    ></div>
    <div
      class="reader-grip"
      data-edge="right"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :title="t('gripTitle')"
      @pointerdown="onGripDown('right', $event)"
      @dblclick="grip.reset()"
      @keydown="onGripKey"
    ></div>
  </section>
</template>
