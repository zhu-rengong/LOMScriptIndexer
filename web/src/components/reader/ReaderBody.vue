<script setup lang="ts">
import { textStore } from "../../data/text";
import { buildReaderBlocks } from "../../lib/blocks";
import { clamp } from "../../lib/browser";
import type { FocusTarget } from "../../stores/panels";
import BlockList from "./BlockList.vue";
import EmptyState from "./EmptyState.vue";
import ReaderSkeleton from "./ReaderSkeleton.vue";
import { useScriptStore } from "../../stores/script";
import { useViewStore } from "../../stores/view";
import { usePanelsStore } from "../../stores/panels";

const store = useScriptStore();
const view = useViewStore();
const panels = usePanelsStore();

const HIT_SELECTOR = [
  ".say .who",
  ".say .what",
  ".option-text",
  ".option-cond",
  ".branch-head .cond",
  ".lore-p",
  ".ending-title",
  ".ending-line",
  ".meta-chips .chip",
  ".meta-chips .meta-action",
  ".time-mark",
].join(", ");

const body = ref<HTMLElement | null>(null);
const reloadTick = ref(0);
const readingId = ref("");
const needsScrollRestore = ref(false);
const scrollMemory = new Map<string, number>();

const node = computed(() => store.selected());

const scrollFraction = (): number => {
  const element = body.value;
  if (!element) return 0;
  const max = element.scrollHeight - element.clientHeight;
  return max > 0 ? clamp(element.scrollTop / max, 0, 1) : 0;
};

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

const applyScrollTop = (top: number) => {
  const element = body.value;
  if (!element) return;
  element.style.scrollBehavior = "auto";
  element.scrollTop = top;
  requestAnimationFrame(() => {
    element.style.scrollBehavior = "";
  });
};

const restoreScroll = () => {
  const element = body.value;
  const current = node.value;
  if (!element || !current) return;
  const remembered = scrollMemory.get(current.id);
  if (remembered !== undefined) {
    applyScrollTop(remembered);
    return;
  }
  const position = store.positionOf(current.id);
  const max = element.scrollHeight - element.clientHeight;
  applyScrollTop(position > 0 && max > 0 ? position * max : 0);
};

const scrollHit = (target: HTMLElement) => {
  const element = body.value;
  if (!element) return;
  const bodyRect = element.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const offset = rect.top - bodyRect.top - Math.max(0, (element.clientHeight - rect.height) / 2);
  element.style.scrollBehavior = "auto";
  element.scrollTop = Math.max(0, element.scrollTop + offset);
  requestAnimationFrame(() => {
    element.style.scrollBehavior = "";
  });
};

const revealHit = (target: HTMLElement) => {
  const element = body.value;
  if (!element) return;
  let current: HTMLElement | null = target.parentElement;
  while (current && current !== element) {
    if (current.dataset.reveal !== undefined) current.dispatchEvent(new Event("reveal"));
    current = current.parentElement;
  }
};

const firstByTarget = (root: HTMLElement, target: FocusTarget): HTMLElement | null =>
  Array.from(root.querySelectorAll<HTMLElement>("[data-kind][data-key]")).find(
    (candidate) => candidate.dataset.kind === target.kind && candidate.dataset.key === target.key,
  ) || null;

const firstByText = (root: HTMLElement, query: string): HTMLElement | null =>
  Array.from(root.querySelectorAll<HTMLElement>(HIT_SELECTOR)).find((candidate) =>
    (candidate.textContent || "").toLowerCase().includes(query),
  ) || null;

const applyHit = async () => {
  const current = node.value;
  if (!current || !blocks.value) return;
  const pending = panels.takePendingHit(current.id);
  if (!pending) return;
  const element = body.value;
  if (!element) return;
  const target =
    (pending.target ? firstByTarget(element, pending.target) : null) ||
    (pending.query ? firstByText(element, pending.query) : null);
  if (!target) return;
  revealHit(target);
  await nextTick();
  scrollHit(target);
};

watch(
  () => [store.selectedId, store.lang] as const,
  async ([id]) => {
    const element = body.value;
    if (element && readingId.value && readingId.value !== id) {
      scrollMemory.set(readingId.value, element.scrollTop);
      store.rememberPosition(readingId.value, scrollFraction());
    }
    readingId.value = id;
    needsScrollRestore.value = true;
    const current = store.selected();
    if (!current) return;
    await textStore.ensureScript(store.textLang(), current.id);
    reloadTick.value++;
  },
  { flush: "pre", immediate: true },
);

watch(blocks, async () => {
  if (!node.value) return;
  await nextTick();
  if (needsScrollRestore.value) {
    needsScrollRestore.value = false;
    restoreScroll();
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

const onScroll = () => {
  const current = node.value;
  if (current) store.rememberPosition(current.id, scrollFraction());
};

const retry = () => {
  reloadTick.value++;
};

defineExpose({ body, scrollFraction });
</script>

<template>
  <div
    id="readerBody"
    ref="body"
    class="reader-body"
    :class="{ 'is-revealing': view.revealOn }"
    :aria-busy="isLoading ? 'true' : 'false'"
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
