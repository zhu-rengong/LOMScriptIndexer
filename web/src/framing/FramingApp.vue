<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import CharacterPanel from "./components/CharacterPanel.vue";
import FrameStage from "./components/FrameStage.vue";
import InspectorPanel from "./components/InspectorPanel.vue";
import { useFramingStore } from "../stores/framing";

const store = useFramingStore();
const file = ref<HTMLInputElement | null>(null);
const navOpen = ref(false);
const toast = ref("");

let timer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.notice,
  (value) => {
    if (!value) return;
    toast.value = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      toast.value = "";
    }, 4200);
  },
);

const frameText = computed(() => {
  const current = store.current;
  if (!current) return "x — · y — · w —";
  const zoom = current.artifact.default.w / current.frame.w;
  return [
    `x ${(current.frame.x * 100).toFixed(2)}%`,
    `y ${(current.frame.y * 100).toFixed(2)}%`,
    `w ${(current.frame.w * 100).toFixed(2)}%`,
    `${zoom.toFixed(2)}×`,
  ].join(" · ");
});

const pickFile = (): void => file.value?.click();

const onFile = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = "";
  if (!picked) return;
  const text = await picked.text();
  store.importText(text);
};

const onKey = (event: KeyboardEvent): void => {
  const target = event.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
  ) {
    return;
  }
  const modifier = event.ctrlKey || event.metaKey;
  if (modifier && !event.altKey && !event.shiftKey) {
    const key = event.key.toLowerCase();
    if (key === "c" || key === "v") {
      if (key === "c") {
        if (store.current) store.copyFrame();
      } else if (store.hasClipboard) {
        store.pasteFrame();
      }
      event.preventDefault();
      return;
    }
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const step = event.shiftKey ? 0.01 : 0.002;
  const key = event.key;
  if (key === "ArrowLeft") store.nudge(-step, 0);
  else if (key === "ArrowRight") store.nudge(step, 0);
  else if (key === "ArrowUp") store.nudge(0, -step);
  else if (key === "ArrowDown") store.nudge(0, step);
  else if (key === "r" || key === "R") store.resetFrame();
  else if (key === "+" || key === "=") store.zoomBy(0.9);
  else if (key === "-" || key === "_") store.zoomBy(1.1);
  else return;
  event.preventDefault();
};

const beforeUnload = (event: BeforeUnloadEvent): void => {
  if (store.dirty) event.preventDefault();
};

onMounted(() => {
  window.addEventListener("keydown", onKey);
  window.addEventListener("beforeunload", beforeUnload);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  window.removeEventListener("beforeunload", beforeUnload);
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="fx-app" :class="{ 'is-nav-open': navOpen, 'is-loading': store.status === 'loading' }">
    <header class="fx-bar">
      <div class="fx-brand">
        <span class="fx-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 7.5V4h3.5M20 7.5V4h-3.5M4 16.5V20h3.5M20 16.5V20h-3.5" />
            <circle cx="12" cy="12" r="3.4" />
          </svg>
        </span>
        <div class="fx-brand-text">
          <strong>Portrait Framing</strong>
          <small
            >local workbench · {{ store.avatarSize[0] }}×{{ store.avatarSize[1] }} avatars</small
          >
        </div>
      </div>

      <div class="fx-bar-mid">
        <span class="fx-chip"
          ><i class="fx-dot is-amber"></i>{{ store.customizedCount }} custom</span
        >
        <span class="fx-chip">{{ store.diskCount }} on disk</span>
        <span v-if="store.dirty" class="fx-chip is-warn">
          <i class="fx-dot is-pulse"></i>unsaved
        </span>
      </div>

      <div class="fx-bar-actions">
        <button type="button" class="fx-btn fx-list-toggle" @click="navOpen = !navOpen">
          Characters
        </button>
        <button
          type="button"
          class="fx-btn"
          :disabled="store.status === 'loading'"
          @click="store.load()"
        >
          Reload
        </button>
        <button type="button" class="fx-btn" @click="pickFile">Import</button>
        <button type="button" class="fx-btn" @click="store.download()">Download</button>
        <button
          type="button"
          class="fx-btn is-primary"
          :disabled="store.saving || !store.dirty"
          @click="store.persist()"
        >
          {{ store.saving ? "Saving…" : "Save to repo" }}
        </button>
        <input
          ref="file"
          class="fx-file"
          type="file"
          accept="application/json,.json"
          @change="onFile"
        />
      </div>
    </header>

    <main class="fx-main">
      <CharacterPanel />
      <div v-if="navOpen" class="fx-scrim" @click="navOpen = false"></div>
      <FrameStage />
      <InspectorPanel />
    </main>

    <div v-if="store.status === 'error'" class="fx-blocked">
      <div class="fx-blocked-card">
        <span class="fx-blocked-mark" aria-hidden="true">!</span>
        <h2>Portrait previews are unavailable</h2>
        <p>{{ store.error }}</p>
        <ol>
          <li>Run <code>uv run scriptindexer-extract --game &lt;path&gt;</code></li>
          <li>Check that <code>data/cache/portrait-previews/index.json</code> exists</li>
          <li>Press <strong>Reload</strong> in the toolbar</li>
        </ol>
      </div>
    </div>

    <footer class="fx-status">
      <div class="fx-status-left">
        <span v-if="store.current" class="fx-status-pick">
          <strong>{{ store.current.label }}</strong>
          <span>{{ store.current.expression }}</span>
        </span>
        <span v-else class="fx-status-pick">no selection</span>
      </div>
      <div class="fx-status-mid fx-mono">{{ frameText }}</div>
      <div class="fx-status-right fx-mono">
        <span>{{ store.expressionCount }} expressions</span>
        <span class="fx-sep">·</span>
        <span v-if="store.dirty" class="fx-warn">unsaved changes</span>
        <span v-else class="fx-ok">in sync</span>
      </div>
    </footer>

    <transition name="fx-toast">
      <div v-if="toast" class="fx-toast" role="status">{{ toast }}</div>
    </transition>
  </div>
</template>
