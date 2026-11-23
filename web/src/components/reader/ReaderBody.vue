<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { useReaderAnchor } from "../../composables/useReaderAnchor";
import { checkpoints } from "../../data/checkpoints";
import { textStore } from "../../data/text";
import { buildReaderBlocks } from "../../lib/blocks";
import type { PendingHit } from "../../stores/panels";

const store = useScriptStore();
const view = useViewStore();
const panels = usePanelsStore();

const body = ref<HTMLElement | null>(null);
const anchor = useReaderAnchor(body);

const reloadTick = ref(0);
const readingId = ref("");
const loadedId = ref("");
let pendingRestore = false;
let restoring = false;
let restoreToken = 0;
let restoreDone = Promise.resolve();
let finishRestore: (() => void) | null = null;

const beginRestore = (): number => {
  restoreToken++;
  finishRestore?.();
  finishRestore = null;
  restoreDone = new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      restoring = false;
      finishRestore = null;
      resolve();
    }, 15000);
    finishRestore = () => {
      window.clearTimeout(timer);
      resolve();
    };
  });
  restoring = true;
  return restoreToken;
};

const endRestore = (token: number): void => {
  if (token !== restoreToken) return;
  restoring = false;
  const finish = finishRestore;
  finishRestore = null;
  finish?.();
};

const node = computed(() => store.selected());

const beatRows = computed(() => {
  void reloadTick.value;
  const current = node.value;
  return current ? textStore.beatRows(store.textLang(), current.id) : null;
});

const blocks = computed(() => (beatRows.value ? buildReaderBlocks(beatRows.value) : null));

const shardState = computed(() => {
  void reloadTick.value;
  const current = node.value;
  return current ? textStore.shardState(current.id) : "ready";
});

const isLoading = computed(
  () => !!node.value && blocks.value === null && shardState.value !== "failed",
);

const isFailed = computed(
  () => !!node.value && blocks.value === null && shardState.value === "failed",
);

const hasBeats = computed(() => !!blocks.value && blocks.value.length > 0);

const rememberReading = (): void => {
  const current = node.value;
  if (!current || !blocks.value?.length) return;
  if (readingId.value && readingId.value !== current.id) return;
  if (pendingRestore || anchor.settling.value) return;
  anchor.remember(current.id);
};

const rememberSettled = useDebounceFn(rememberReading, 120);

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

let pendingSince = 0;

watch(
  () => panels.pendingHit,
  (hit) => {
    pendingSince = hit ? performance.now() : 0;
  },
  { immediate: true },
);

const staleHit = (hit: PendingHit): boolean =>
  panels.pendingHit !== hit ||
  pendingRestore ||
  restoring ||
  readingId.value !== hit.id ||
  node.value?.id !== hit.id ||
  loadedId.value !== hit.id;

const applyHit = async (): Promise<boolean> => {
  if (pendingRestore || restoring) await restoreDone;
  const pending = panels.pendingHit;
  const current = node.value;
  if (!pending || !current || current.id !== pending.id || !blocks.value) return false;
  if (pendingSince && performance.now() - pendingSince > 15000) {
    panels.takePendingHit(current.id);
    return false;
  }
  if (staleHit(pending)) return false;
  if (pending.target) {
    await checkpoints.ensure(pending.target.key);
    await nextTick();
    if (staleHit(pending)) return false;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    if (staleHit(pending)) return false;
    const target = anchor.find(pending.target, pending.query);
    if (target) {
      await anchor.reveal(target);
      if (await anchor.center(target)) {
        if (staleHit(pending)) return false;
        panels.takePendingHit(current.id);
        return true;
      }
    }
    await nextTick();
    await nextFrame();
  }
  return false;
};

let hitRun = 0;

const retryHit = async (): Promise<void> => {
  const run = ++hitRun;
  const deadline = performance.now() + 15000;
  while (run === hitRun && panels.pendingHit && performance.now() < deadline) {
    if (await applyHit()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
};

onUnmounted(() => {
  hitRun++;
});

watch(
  () => [store.selectedId, store.lang] as const,
  async ([id]) => {
    if (readingId.value && readingId.value !== id) anchor.remember(readingId.value);
    readingId.value = id;
    loadedId.value = "";
    const token = beginRestore();
    pendingRestore = true;
    const current = store.selected();
    if (!current) {
      pendingRestore = false;
      endRestore(token);
      return;
    }
    await textStore.ensureScript(store.textLang(), current.id);
    reloadTick.value++;
  },
  { flush: "sync", immediate: true },
);

watch(
  blocks,
  async () => {
    const current = node.value;
    if (!current || blocks.value === null) return;
    const id = current.id;
    await nextTick();
    if (node.value?.id !== id || readingId.value !== id) return;
    loadedId.value = id;
    if (pendingRestore) {
      const token = restoreToken;
      pendingRestore = false;
      try {
        await anchor.restore(store.readingAnchor(id));
      } finally {
        endRestore(token);
      }
    }
    await retryHit();
  },
  { immediate: true },
);

watch(
  () => panels.pendingHit,
  async () => {
    await nextTick();
    await retryHit();
  },
);

const TAP_EXCLUDE = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  '[role="button"]',
  '[role="tab"]',
  "[data-kind][data-key]",
  '[contenteditable="true"]',
].join(", ");

const onBodyTap = (event: MouseEvent): void => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest(TAP_EXCLUDE)) return;
  view.toggleChrome();
};

const onScroll = (): void => {
  if (!anchor.settling.value && !pendingRestore) rememberSettled();
};

const retry = () => {
  reloadTick.value++;
};
</script>

<template>
  <div
    id="readerBody"
    ref="body"
    class="reader-body"
    :class="{ 'is-revealing': view.revealOn }"
    :aria-busy="isLoading ? 'true' : 'false'"
    @click="onBodyTap"
    @scroll.passive="onScroll"
  >
    <EmptyState v-if="!node" no-selection />
    <ReaderSkeleton v-else-if="isLoading" />
    <ReaderSkeleton v-else-if="isFailed" failed @retry="retry" />
    <EmptyState
      v-else-if="!hasBeats"
      :no-selection="false"
      :is-script-file-empty="!!node.flags.isEmpty"
    />
    <BlockList v-else :key="node.id" :blocks="blocks || []" />
  </div>
</template>
