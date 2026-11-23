<script setup lang="ts">
import { useDebounceFn, useScroll } from "@vueuse/core";
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

const STRUCT = [
  ".choice",
  ".option",
  ".option-body",
  ".branch-group",
  ".branch",
  ".branch-body",
  ".battle",
  ".battle-campaign-events",
  ".battle-event",
  ".battle-body",
  ".jump-group",
  ".jump-body",
].join(", ");
const MAX_DEPTH = 12;

const scaleOf = (element: HTMLElement): number => {
  const width = element.offsetWidth;
  return width > 0 ? element.getBoundingClientRect().width / width : 1;
};

const childIndex = (parent: HTMLElement, child: Element): number =>
  Array.from(parent.children).indexOf(child);

const childAtTop = (container: HTMLElement, top: number): HTMLElement | null => {
  let first: HTMLElement | null = null;
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const rect = child.getBoundingClientRect();
    if (rect.height > 0 && rect.top <= top + 1 && rect.bottom > top) return child;
    if (!first && rect.bottom > top) first = child;
  }
  return first;
};

const pathOf = (root: HTMLElement, top: number): { path: number[]; target: HTMLElement } => {
  const path: number[] = [];
  let container = root;
  let target = root;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const child = childAtTop(container, top);
    if (!child) break;
    const index = childIndex(container, child);
    if (index < 0) break;
    path.push(index);
    target = child;
    if (!child.matches(STRUCT)) break;
    container = child;
  }
  return { path, target };
};

const captureAnchor = (element: HTMLElement): ReadingAnchor | null => {
  const top = element.getBoundingClientRect().top;
  const { path, target } = pathOf(element, top);
  if (!path.length) return null;
  const offset = Math.round((top - target.getBoundingClientRect().top) / scaleOf(element));
  return { path, offset };
};

const rememberReading = (): void => {
  const element = body.value;
  const current = node.value;
  if (!element || !current || !blocks.value || !blocks.value.length) return;
  if (readingId.value && readingId.value !== current.id) return;
  if (pendingRestore || settling) return;
  if (element.scrollTop <= 0) {
    store.rememberAnchor(current.id, { path: [], offset: 0 });
    return;
  }
  const anchor = captureAnchor(element);
  if (anchor) store.rememberAnchor(current.id, anchor);
};

const resolvePath = (
  root: HTMLElement,
  path: number[],
): { target: HTMLElement | null; complete: boolean } => {
  let container = root;
  let target: HTMLElement | null = null;
  for (const index of path) {
    const child = container.children[index];
    if (!(child instanceof HTMLElement)) return { target, complete: false };
    target = child;
    container = child;
  }
  return { target, complete: true };
};

const alignTo = (element: HTMLElement, target: HTMLElement, position: number): void => {
  for (let pass = 0; pass < 6; pass++) {
    const scale = scaleOf(element);
    const gap = (target.getBoundingClientRect().top - element.getBoundingClientRect().top) / scale;
    const delta = gap - position;
    if (Math.abs(delta) < 1) return;
    const before = element.scrollTop;
    element.scrollTop = before + delta;
    if (element.scrollTop === before) return;
  }
};

let settleToken = 0;
let settling = false;

const scrollToTarget = (target: HTMLElement | null, position: number, remember = true) =>
  new Promise<void>((resolve) => {
    const element = body.value;
    if (!element) {
      resolve();
      return;
    }
    const token = ++settleToken;
    settling = true;
    const step = (pass: number): void => {
      const current = body.value;
      if (!current || token !== settleToken) {
        resolve();
        return;
      }
      if (target) alignTo(current, target, position);
      else current.scrollTop = 0;
      scrollBase = current.scrollTop;
      if (pass >= 2) {
        settling = false;
        if (remember) rememberReading();
        resolve();
        return;
      }
      requestAnimationFrame(() => void nextTick(() => step(pass + 1)));
    };
    step(0);
  });

const revealAncestors = (target: HTMLElement | null): void => {
  const element = body.value;
  if (!element) return;
  let current: HTMLElement | null = target;
  while (current && current !== element) {
    if (current.dataset.reveal !== undefined) current.dispatchEvent(new Event("reveal"));
    current = current.parentElement;
  }
};

const revealCollapsed = (target: HTMLElement): boolean => {
  if (target.getBoundingClientRect().height > 0) return false;
  revealAncestors(target);
  return true;
};

const restoreScroll = async (): Promise<void> => {
  const element = body.value;
  const current = node.value;
  if (!element || !current) return;
  const anchor = store.readingAnchor(current.id);
  if (!anchor || !anchor.path.length) {
    await scrollToTarget(null, 0);
    return;
  }
  const resolved = resolvePath(element, anchor.path);
  if (!resolved.target) {
    await scrollToTarget(null, 0);
    return;
  }
  if (revealCollapsed(resolved.target)) await nextTick();
  await scrollToTarget(resolved.target, resolved.complete ? -anchor.offset : 0, false);
  if (resolved.complete) store.rememberAnchor(current.id, anchor);
};

const scrollHit = (target: HTMLElement) => {
  const element = body.value;
  if (!element) return;
  const box = element.getBoundingClientRect();
  const height = target.getBoundingClientRect().height;
  scrollToTarget(target, Math.max(0, (box.height - height) / 2 / scaleOf(element)));
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
  revealAncestors(target);
  await nextTick();
  scrollHit(target);
};

watch(
  () => [store.selectedId, store.lang] as const,
  async ([id]) => {
    const element = body.value;
    if (element && readingId.value && readingId.value !== id) {
      const anchor = captureAnchor(element);
      if (anchor) store.rememberAnchor(readingId.value, anchor);
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
    await restoreScroll();
    pendingRestore = false;
  }
  await applyHit();
});

const rememberSettled = useDebounceFn(rememberReading, 120);

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
  if (!settling && !pendingRestore) rememberSettled();
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
