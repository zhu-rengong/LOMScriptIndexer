<script setup lang="ts">
import { useDebounceFn } from "@vueuse/core";
import { useReaderAnchor } from "../../composables/useReaderAnchor";
import { textStore } from "../../data/text";
import { buildReaderBlocks } from "../../lib/blocks";

const store = useScriptStore();
const view = useViewStore();
const panels = usePanelsStore();

const body = ref<HTMLElement | null>(null);
const anchor = useReaderAnchor(body);

const reloadTick = ref(0);
const readingId = ref("");
let pendingRestore = false;

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

const applyHit = async (): Promise<void> => {
  const current = node.value;
  if (!current || !blocks.value) return;
  const pending = panels.takePendingHit(current.id);
  if (!pending) return;
  const target = anchor.find(pending.target, pending.query);
  if (!target) return;
  anchor.reveal(target);
  await nextTick();
  await anchor.center(target);
};

watch(
  () => [store.selectedId, store.lang] as const,
  async ([id]) => {
    if (readingId.value && readingId.value !== id) anchor.remember(readingId.value);
    readingId.value = id;
    pendingRestore = true;
    const current = store.selected();
    if (!current) return;
    await textStore.ensureScript(store.textLang(), current.id);
    reloadTick.value++;
  },
  { flush: "pre", immediate: true },
);

watch(blocks, async () => {
  const current = node.value;
  if (!current || blocks.value === null) return;
  await nextTick();
  if (pendingRestore) {
    await anchor.restore(store.readingAnchor(current.id));
    pendingRestore = false;
  }
  await applyHit();
});

watch(
  () => panels.pendingHit,
  async () => {
    await nextTick();
    await applyHit();
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
