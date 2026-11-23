import { normalizeSearchText } from "../lib/strings";
import type { ReadingAnchor } from "../stores/script";
import type { FocusTarget } from "../types/focus";

const BLOCK_SELECTOR = "[data-block-path]";

const scaleOf = (element: HTMLElement): number => {
  const width = element.offsetWidth;
  return width > 0 ? element.getBoundingClientRect().width / width : 1;
};

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const useReaderAnchor = (body: Ref<HTMLElement | null>) => {
  const store = useScriptStore();
  const fold = useFoldStore();
  const settling = ref(false);

  const blockAt = (element: HTMLElement): HTMLElement | null => {
    const rect = element.getBoundingClientRect();
    const nodes = document.elementsFromPoint(
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + 1),
    );
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      const block = node.closest<HTMLElement>(BLOCK_SELECTOR);
      if (block && element.contains(block)) return block;
    }
    const top = rect.top;
    let crossing: HTMLElement | null = null;
    let first: HTMLElement | null = null;
    for (const block of element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
      const box = block.getBoundingClientRect();
      if (box.height <= 0) continue;
      if (box.top <= top + 1 && box.bottom > top) crossing = block;
      else if (!first && box.bottom > top) first = block;
    }
    return crossing ?? first;
  };

  const blockOfPath = (path: string): HTMLElement | null => {
    const element = body.value;
    if (!element || !path) return null;
    for (const block of element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)) {
      if (block.dataset.blockPath === path) return block;
    }
    return null;
  };

  const byTarget = (target: FocusTarget): HTMLElement | null => {
    const element = body.value;
    if (!element) return null;
    for (const node of element.querySelectorAll<HTMLElement>("[data-kind][data-key]")) {
      if (node.dataset.kind === target.kind && node.dataset.key === target.key) return node;
    }
    return null;
  };

  const byText = (query: string): HTMLElement | null => {
    const element = body.value;
    const needle = normalizeSearchText(query);
    if (!element || !needle) return null;
    const blocks = Array.from(element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).reverse();
    for (const block of blocks) {
      if (normalizeSearchText(block.textContent || "").includes(needle)) return block;
    }
    return null;
  };

  const find = (target: FocusTarget | null, query: string): HTMLElement | null =>
    (target ? byTarget(target) : null) || (query ? byText(query) : null);

  const remember = (id: string): void => {
    const element = body.value;
    if (!element || !id) return;
    if (element.scrollTop <= 0) {
      store.rememberAnchor(id, { path: "", offset: 0 });
      return;
    }
    const block = blockAt(element);
    const path = block?.dataset.blockPath || "";
    if (!block || !path) {
      store.rememberAnchor(id, { path: "", offset: 0 });
      return;
    }
    const offset = Math.round(
      (element.getBoundingClientRect().top - block.getBoundingClientRect().top) / scaleOf(element),
    );
    store.rememberAnchor(id, { path, offset });
  };

  const reveal = (target: HTMLElement): void => {
    const path = target.dataset.blockPath || "";
    if (path) fold.openPath(path);
  };

  const restore = async (anchor: ReadingAnchor | null): Promise<void> => {
    const element = body.value;
    if (!element) return;
    settling.value = true;
    try {
      if (!anchor || !anchor.path) {
        element.scrollTop = 0;
        return;
      }
      fold.openPath(anchor.path);
      await nextTick();
      const fonts = document.fonts?.ready;
      if (fonts) await fonts;
      const target = blockOfPath(anchor.path);
      if (!target) {
        element.scrollTop = 0;
        return;
      }
      const adjust = (): void => {
        const gap =
          (target.getBoundingClientRect().top - element.getBoundingClientRect().top) /
          scaleOf(element);
        element.scrollTop += gap + anchor.offset;
      };
      adjust();
      await nextTick();
      await nextFrame();
      adjust();
    } finally {
      settling.value = false;
    }
  };

  const center = async (target: HTMLElement): Promise<void> => {
    const element = body.value;
    if (!element) return;
    settling.value = true;
    try {
      const adjust = (): void => {
        const scale = scaleOf(element);
        const bodyRect = element.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const gap = (targetRect.top - bodyRect.top) / scale;
        const room = Math.max(0, (bodyRect.height - targetRect.height) / 2 / scale);
        element.scrollTop += gap - room;
      };
      adjust();
      await nextTick();
      await nextFrame();
      adjust();
    } finally {
      settling.value = false;
    }
  };

  return { settling, remember, reveal, restore, center, find };
};
