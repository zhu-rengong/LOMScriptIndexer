import { normalizeSearchText } from "../lib/strings";
import type { ReadingAnchor } from "../stores/script";
import type { FocusTarget } from "../types/focus";

const BLOCK_SELECTOR = "[data-block-path]";
const MEASURE_CLASS = "is-measuring";
const MAX_SETTLE_PASSES = 4;
const MAX_ALIGN_STEPS = 8;

const scaleOf = (element: HTMLElement): number => {
  const width = element.offsetWidth;
  return width > 0 ? element.getBoundingClientRect().width / width : 1;
};

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

const offsetOf = (element: HTMLElement, target: HTMLElement): number =>
  (target.getBoundingClientRect().top - element.getBoundingClientRect().top) / scaleOf(element);

const align = (element: HTMLElement, target: HTMLElement, position: number): void => {
  for (let step = 0; step < MAX_ALIGN_STEPS; step++) {
    const delta = offsetOf(element, target) - position;
    if (Math.abs(delta) < 1) return;
    const before = element.scrollTop;
    element.scrollTop = before + delta;
    if (element.scrollTop === before) return;
  }
};

const settle = async (
  element: HTMLElement,
  target: HTMLElement,
  position: number,
): Promise<void> => {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
    align(element, target, position);
    await nextFrame();
    await nextTick();
    if (Math.abs(offsetOf(element, target) - position) < 1) return;
  }
};

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
    let hit: HTMLElement | null = null;
    let depth = -1;
    for (const node of element.querySelectorAll<HTMLElement>("[data-kind][data-key]")) {
      if (node.dataset.kind !== target.kind || node.dataset.key !== target.key) continue;
      const block = node.closest<HTMLElement>(BLOCK_SELECTOR);
      const length = block?.dataset.blockPath?.split("/").length ?? 0;
      if (length > depth) {
        hit = node;
        depth = length;
      }
    }
    return hit;
  };

  const elementsContaining = (root: HTMLElement, needle: string): HTMLElement[] => {
    const out: HTMLElement[] = [];
    const visit = (node: HTMLElement): void => {
      for (const child of node.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (!normalizeSearchText(child.textContent || "").includes(needle)) continue;
        out.push(child);
        visit(child);
      }
    };
    visit(root);
    return out;
  };

  const byText = (query: string): HTMLElement | null => {
    const element = body.value;
    const needle = normalizeSearchText(query);
    if (!element || !needle) return null;
    const blocks = Array.from(element.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)).reverse();
    for (const block of blocks) {
      if (!normalizeSearchText(block.textContent || "").includes(needle)) continue;
      const hits = elementsContaining(block, needle);
      return hits[hits.length - 1] || block;
    }
    return null;
  };

  const find = (target: FocusTarget | null, query: string): HTMLElement | null => {
    const exact = (target ? byTarget(target) : null) || (query ? byText(query) : null);
    if (!exact) return null;
    const block = exact.closest<HTMLElement>(BLOCK_SELECTOR);
    const path = block?.dataset.blockPath || "";
    if (!path) return exact;
    return blockOfPath(path) ? exact : null;
  };

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

  const visibleAt = (path: string): HTMLElement | null => {
    const target = blockOfPath(path);
    return target && target.getBoundingClientRect().height > 0 ? target : null;
  };

  const open = async (path: string): Promise<HTMLElement | null> => {
    if (!path) return null;
    fold.openPath(path);
    await nextTick();
    const first = visibleAt(path);
    if (first) return first;
    fold.openPath(path);
    await nextTick();
    return visibleAt(path);
  };

  const reveal = async (target: HTMLElement): Promise<void> => {
    const block = target.closest<HTMLElement>(BLOCK_SELECTOR) || target;
    await open(block.dataset.blockPath || "");
  };

  const measured = async (
    element: HTMLElement,
    target: HTMLElement,
    position: number | ((root: HTMLElement) => number),
  ): Promise<void> => {
    const value = (): number => (typeof position === "function" ? position(element) : position);
    element.classList.add(MEASURE_CLASS);
    try {
      await nextFrame();
      await settle(element, target, value());
    } finally {
      element.classList.remove(MEASURE_CLASS);
    }
    await nextFrame();
    await settle(element, target, value());
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
      const fonts = document.fonts?.ready;
      if (fonts) await fonts;
      const target = await open(anchor.path);
      if (!target) {
        element.scrollTop = 0;
        return;
      }
      await measured(element, target, -anchor.offset);
    } finally {
      settling.value = false;
    }
  };

  const center = async (target: HTMLElement): Promise<boolean> => {
    const element = body.value;
    if (!element) return false;
    settling.value = true;
    try {
      await nextTick();
      const fonts = document.fonts?.ready;
      if (fonts) await fonts;
      if (!element.contains(target) || target.getBoundingClientRect().height <= 0) return false;
      await measured(element, target, (root) => {
        const bodyRect = root.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        return Math.max(0, (bodyRect.height - targetRect.height) / 2 / scaleOf(root));
      });
      return true;
    } finally {
      settling.value = false;
    }
  };

  return { settling, remember, reveal, restore, center, find };
};
