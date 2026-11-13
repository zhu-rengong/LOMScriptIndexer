import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import type { Middleware, Placement as FloatingPlacement, VirtualElement } from "@floating-ui/dom";
import { byId, focusableElements } from "./browser";
import type { OverlayKey } from "./overlayKeys";

const MARGIN = 12;
const GAP = 8;
const TRAP_GROUPS: Record<string, boolean> = { sheet: true, modal: true };
const AUTO_CLOSE_GROUPS: Record<string, boolean> = { menu: true, pop: true };

export type Placement = {
  align?: "start" | "center" | "end";
  width?: number;
  matchWidth?: boolean;
  fit?: boolean;
  gap?: number;
  side?: "top";
  margin?: number;
};

export type OverlayDef = {
  id: string;
  triggerId?: string;
  trigger?: HTMLElement | null;
  group?: string;
  keep?: OverlayKey[];
  autofocus?: string;
  placement?: Placement;
  onOpen?: () => void;
  onHide?: () => void;
};

const defs = new Map<OverlayKey, OverlayDef>();
const openState = reactive<Record<string, boolean>>({});
const stack: { key: OverlayKey; trigger: HTMLElement | null; focusInside: boolean }[] = [];
const cleanups = new Map<OverlayKey, () => void>();

const panelOf = (def: OverlayDef | undefined): HTMLElement | null => (def ? byId(def.id) : null);

const triggerOf = (
  def: OverlayDef | undefined,
  explicit?: HTMLElement | null,
): HTMLElement | null => explicit || (def && def.trigger) || null;

const floatingSide = (options: Placement): FloatingPlacement => {
  const side = options.side === "top" ? "top" : "bottom";
  const align = options.align === "start" ? "start" : options.align === "center" ? "" : "end";
  return (align ? `${side}-${align}` : side) as FloatingPlacement;
};

const virtualAnchor = (margin: number): VirtualElement => ({
  getBoundingClientRect: () => {
    const width = document.documentElement.clientWidth || window.innerWidth;
    return {
      x: margin,
      y: margin,
      top: margin,
      left: margin,
      right: width - margin,
      bottom: margin,
      width: width - margin * 2,
      height: 0,
    };
  },
});

const sizeMiddleware = (options: Placement, margin: number): Middleware =>
  size({
    padding: margin,
    apply({ rects, elements, availableWidth, availableHeight }) {
      let width = 0;
      if (options.width) width = Math.min(options.width, availableWidth);
      else if (options.matchWidth) width = Math.min(rects.reference.width, availableWidth);
      elements.floating.style.width = width ? `${Math.round(width)}px` : "";
      elements.floating.style.maxHeight = options.fit
        ? `${Math.max(120, Math.round(availableHeight))}px`
        : "";
    },
  });

const place = async (
  panel: HTMLElement | null,
  trigger: HTMLElement | null,
  options?: Placement,
): Promise<void> => {
  if (!panel) return;
  const opts = options || {};
  const margin = opts.margin == null ? MARGIN : opts.margin;
  const gap = opts.gap == null ? GAP : opts.gap;
  const middleware: Middleware[] = [
    offset(gap),
    flip({ padding: margin }),
    shift({ padding: margin }),
  ];
  if (opts.fit || opts.width || opts.matchWidth) middleware.push(sizeMiddleware(opts, margin));
  panel.classList.add("is-overlay");
  panel.style.position = "fixed";
  panel.style.margin = "0";
  const anchor = trigger ?? virtualAnchor(margin);
  const result = await computePosition(anchor, panel, {
    strategy: "fixed",
    placement: floatingSide(opts),
    middleware,
  });
  panel.style.left = `${Math.round(result.x)}px`;
  panel.style.top = `${Math.round(result.y)}px`;
};

const stopPlacement = (key: OverlayKey): void => {
  const stop = cleanups.get(key);
  cleanups.delete(key);
  if (stop) stop();
};

const startPlacement = (key: OverlayKey): void => {
  const def = defs.get(key);
  const panel = panelOf(def);
  if (!def || !panel || !def.placement) return;
  stopPlacement(key);
  const anchor = triggerOf(def) ?? virtualAnchor(def.placement.margin ?? MARGIN);
  const update = () => {
    void place(panel, triggerOf(def), def.placement);
  };
  cleanups.set(key, autoUpdate(anchor, panel, update));
};

let focusRingSuppressor: { clear: () => void } | null = null;

const clearFocusRingSuppressor = (): void => {
  const current = focusRingSuppressor;
  if (!current) return;
  focusRingSuppressor = null;
  current.clear();
};

const suppressFocusRing = (node: HTMLElement): void => {
  clearFocusRingSuppressor();
  const clear = () => {
    if (focusRingSuppressor && focusRingSuppressor.clear === clear) {
      focusRingSuppressor = null;
    }
    node.classList.remove("is-focus-silent");
    document.removeEventListener("keydown", clear, true);
    document.removeEventListener("pointerdown", clear, true);
    node.removeEventListener("blur", clear);
  };
  node.classList.add("is-focus-silent");
  focusRingSuppressor = { clear };
  document.addEventListener("keydown", clear, true);
  document.addEventListener("pointerdown", clear, true);
  node.addEventListener("blur", clear, { once: true });
};

const restoreFocus = (layer: { trigger: HTMLElement | null }): void => {
  const trigger = layer.trigger;
  if (!trigger || !trigger.isConnected || (trigger as HTMLButtonElement).disabled) return;
  suppressFocusRing(trigger);
  try {
    trigger.focus({ preventScroll: true });
  } catch {
    try {
      trigger.focus();
    } catch {
      clearFocusRingSuppressor();
    }
  }
};

const hideLayer = (key: OverlayKey): void => {
  const def = defs.get(key);
  if (!def) return;
  openState[key] = false;
  if (typeof def.onHide === "function") def.onHide();
};

const open = (
  key: OverlayKey,
  options?: {
    trigger?: HTMLElement | null;
    keep?: OverlayKey[];
    autofocus?: string;
    placement?: Placement;
  },
): boolean => {
  const opts = options || {};
  const def = defs.get(key);
  if (!def) return false;
  const panel = panelOf(def);
  if (!panel) return false;

  const keep = (def.keep || []).concat(opts.keep || []);
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index].key === key) continue;
    if (keep.indexOf(stack[index].key) >= 0) continue;
    close(stack[index].key, { restoreFocus: false });
  }

  const trigger = triggerOf(def, opts.trigger) || (def.triggerId ? byId(def.triggerId) : null);
  if (trigger) def.trigger = trigger;
  openState[key] = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");

  const existing = stack.find((layer) => layer.key === key);
  if (!existing) {
    stack.push({
      key,
      trigger: trigger || (document.activeElement as HTMLElement | null),
      focusInside: panel.contains(document.activeElement),
    });
  } else if (trigger) {
    existing.trigger = trigger;
  }

  const placement = opts.placement || def.placement;
  if (placement) def.placement = placement;
  startPlacement(key);

  if (!existing) {
    const autofocus = opts.autofocus || def.autofocus;
    if (autofocus) {
      const target = typeof autofocus === "string" ? byId(autofocus) : autofocus;
      if (target) {
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus();
        }
      }
    }
  }
  if (typeof def.onOpen === "function") def.onOpen();
  return true;
};

const close = (key: OverlayKey, options?: { restoreFocus?: boolean }): boolean => {
  const opts = options || {};
  stopPlacement(key);
  const index = stack.findIndex((layer) => layer.key === key);
  if (index < 0) {
    hideLayer(key);
    return false;
  }
  const layer = stack.splice(index, 1)[0];
  hideLayer(key);
  if (opts.restoreFocus && !layer.focusInside) restoreFocus(layer);
  return true;
};

const topKey = (): OverlayKey | null => (stack.length ? stack[stack.length - 1].key : null);

const closeTop = (): boolean => {
  const key = topKey();
  if (!key) return false;
  return close(key, { restoreFocus: true });
};

const trapTab = (event: KeyboardEvent): void => {
  const key = topKey();
  const def = key ? defs.get(key) : undefined;
  if (!def || !TRAP_GROUPS[def.group || "menu"]) return;
  const root = panelOf(def);
  if (!root) return;
  const list = focusableElements(root);
  if (!list.length) return;
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (!root.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};

document.addEventListener(
  "keydown",
  (event) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      if (closeTop()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (event.key === "Tab") trapTab(event);
  },
  true,
);

document.addEventListener("click", (event) => {
  for (let guard = 0; guard < 8; guard++) {
    const key = topKey();
    const def = key ? defs.get(key) : undefined;
    if (!key || !def || !AUTO_CLOSE_GROUPS[def.group || ""]) return;
    const panel = panelOf(def);
    const trigger = triggerOf(def);
    if (!panel || panel.hidden) return;
    const target = event.target as Node;
    if (panel.contains(target)) return;
    if (trigger && trigger.contains && trigger.contains(target)) return;
    let kept = false;
    for (const keep of def.keep || []) {
      const keptDef = defs.get(keep);
      const keptPanel = keptDef && panelOf(keptDef);
      if (keptPanel && keptPanel.contains(target)) {
        kept = true;
        break;
      }
    }
    close(key, { restoreFocus: false });
    if (kept) return;
  }
});

export const overlay = {
  register: (key: OverlayKey, def: OverlayDef): void => {
    defs.set(key, def);
    if (openState[key] === undefined) openState[key] = false;
  },
  unregister: (key: OverlayKey): void => {
    close(key, { restoreFocus: false });
    defs.delete(key);
    delete openState[key];
  },
  isOpen: (key: OverlayKey): boolean => !!openState[key],
  open,
  close,
  place,
};
