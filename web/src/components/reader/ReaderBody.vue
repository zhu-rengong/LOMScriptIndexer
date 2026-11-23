<script setup lang="ts">
import { useScroll } from "@vueuse/core";
import { textStore } from "../../data/text";
import { buildReaderBlocks } from "../../lib/blocks";
import { normalizeSearchText } from "../../lib/browser";
import type { ReadingAnchor } from "../../stores/script";

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
let pendingRestore = false;
let scrollBase = 0;

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

const scaleOf = (element: HTMLElement): number => {
  const width = element.offsetWidth;
  return width > 0 ? element.getBoundingClientRect().width / width : 1;
};

const anchorOf = (element: HTMLElement): ReadingAnchor => {
  const top = element.getBoundingClientRect().top;
  const scale = scaleOf(element);
  const children = element.children;
  let index = Math.max(0, children.length - 1);
  let offset = 0;
  for (let i = 0; i < children.length; i++) {
    const rect = (children[i] as HTMLElement).getBoundingClientRect();
    if (rect.bottom <= top) continue;
    index = i;
    offset = Math.round((top - rect.top) / scale);
    break;
  }
  return { index, offset };
};

const restoreScroll = (): void => {
  const element = body.value;
  const current = node.value;
  if (!element || !current) return;
  const anchor = store.readingAnchor(current.id);
  const target = anchor ? element.children[anchor.index] : undefined;
  if (anchor && target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    if (anchor.offset) element.scrollBy({ top: anchor.offset, behavior: "instant" });
  } else {
    element.scrollTo({ top: 0, behavior: "instant" });
  }
  scrollBase = element.scrollTop;
};

const scrollHit = (target: HTMLElement) => {
  target.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  if (body.value) scrollBase = body.value.scrollTop;
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
      store.rememberAnchor(readingId.value, anchorOf(element));
    }
    readingId.value = id;
    pendingRestore = true;
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
  if (blocks.value === null) return;
  await nextTick();
  if (pendingRestore) {
    pendingRestore = false;
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
  if (!view.chromeHidden) return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || target.closest(TAP_EXCLUDE)) return;
  view.showChrome();
};

const { y } = useScroll(body);

watch(y, (value) => {
  const delta = value - scrollBase;
  scrollBase = value;
  if (!view.sheetMode || pendingRestore) return;
  const element = body.value;
  if (!element) return;
  if (value <= 8) {
    view.showChrome();
    return;
  }
  if (delta > 4 && value > element.clientHeight * 0.5) {
    view.hideChrome();
    return;
  }
  if (delta < -4) view.showChrome();
});

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
