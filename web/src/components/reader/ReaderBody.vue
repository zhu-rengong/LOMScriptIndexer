<script setup lang="ts">
import { textStore } from "../../data/text";
import { buildReaderBlocks } from "../../lib/blocks";
import { normalizeSearchText } from "../../lib/browser";
import { clamp } from "../../lib/math";

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

const SCROLL_DELTA = 6;

type ScrollAnchor = { index: number; offset: number };

const body = ref<HTMLElement | null>(null);
const reloadTick = ref(0);
const readingId = ref("");
const needsScrollRestore = ref(false);
const scrollMemory = new Map<string, ScrollAnchor>();
let lastScrollTop = 0;

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
  lastScrollTop = element.scrollTop;
  requestAnimationFrame(() => {
    element.style.scrollBehavior = "";
  });
};

const anchorOf = (element: HTMLElement): ScrollAnchor => {
  const base = element.getBoundingClientRect().top;
  const children = element.children;
  let index = Math.max(0, children.length - 1);
  let offset = 0;
  for (let i = 0; i < children.length; i++) {
    const rect = (children[i] as HTMLElement).getBoundingClientRect();
    if (rect.bottom <= base) continue;
    index = i;
    offset = Math.round(base - rect.top);
    break;
  }
  return { index, offset };
};

const restoreScroll = () => {
  const element = body.value;
  const current = node.value;
  if (!element || !current) return;
  const anchor = scrollMemory.get(current.id);
  const target = anchor ? element.children[anchor.index] : undefined;
  if (anchor && target instanceof HTMLElement) {
    element.style.scrollBehavior = "auto";
    target.scrollIntoView({ block: "start", inline: "nearest" });
    if (anchor.offset) element.scrollTop += anchor.offset;
    lastScrollTop = element.scrollTop;
    requestAnimationFrame(() => {
      element.style.scrollBehavior = "";
    });
    return;
  }
  const position = store.positionOf(current.id);
  const max = element.scrollHeight - element.clientHeight;
  applyScrollTop(position > 0 && max > 0 ? Math.round(position * max) : 0);
};

const scrollHit = (target: HTMLElement) => {
  const element = body.value;
  if (!element) return;
  element.style.scrollBehavior = "auto";
  target.scrollIntoView({ block: "center", inline: "nearest" });
  lastScrollTop = element.scrollTop;
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

const firstByText = (root: HTMLElement, query: string): HTMLElement | null => {
  const needle = normalizeSearchText(query);
  if (!needle) return null;
  return (
    Array.from(root.querySelectorAll<HTMLElement>(HIT_SELECTOR)).find((candidate) =>
      normalizeSearchText(candidate.textContent || "").includes(needle),
    ) || null
  );
};

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
      scrollMemory.set(readingId.value, anchorOf(element));
      store.rememberPosition(readingId.value, scrollFraction());
    }
    readingId.value = id;
    needsScrollRestore.value = true;
    lastScrollTop = 0;
    view.showChrome();
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
  const element = body.value;
  const current = node.value;
  if (!element) return;
  if (current) store.rememberPosition(current.id, scrollFraction());
  if (!view.sheetMode) return;
  const top = element.scrollTop;
  const delta = top - lastScrollTop;
  lastScrollTop = top;
  if (top <= 8) {
    view.showChrome();
    return;
  }
  if (delta > SCROLL_DELTA && top > element.clientHeight * 0.5) {
    view.hideChrome();
    return;
  }
  if (delta < -SCROLL_DELTA) view.showChrome();
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
