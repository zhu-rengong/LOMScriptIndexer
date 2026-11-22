import { computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import type { Middleware, Placement as FloatingPlacement, VirtualElement } from "@floating-ui/dom";
import { onClickOutside, useEventListener, useMediaQuery } from "@vueuse/core";
import { useFocusTrap } from "@vueuse/integrations/useFocusTrap";
import type { OverlayKey } from "../ui/ids";
import { byId } from "./browser";

const MARGIN = 12;
const GAP = 8;
const TRAP_GROUPS: Record<string, boolean> = { sheet: true, modal: true };
const AUTO_CLOSE_GROUPS: Record<string, boolean> = { menu: true, pop: true };

const sheetMode = useMediaQuery("(max-width: 767px)");

export type Placement = {
  align?: "start" | "center" | "end";
  width?: number;
  matchWidth?: boolean;
  fit?: boolean;
  gap?: number;
  side?: "top";
  margin?: number;
};

export type PopoverDef = {
  id: string;
  triggerId?: string;
  group?: string;
  keep?: OverlayKey[];
  autofocus?: string;
  placement?: Placement;
  float?: boolean;
  onOpen?: () => void;
  onHide?: () => void;
};

type Layer = { key: OverlayKey; trigger: HTMLElement | null; focusInside: boolean };

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

export class PopoverHost {
  private readonly defs = new Map<OverlayKey, PopoverDef>();
  private readonly openState = reactive<Record<string, boolean>>({});
  private readonly stack: Layer[] = [];
  private readonly outsideStops = new Map<OverlayKey, () => void>();
  private readonly stackRevision = ref(0);
  private pendingAutofocus = "";
  private ringSuppressor: (() => void) | null = null;

  private readonly trapPanel = computed<HTMLElement | null>(() => {
    void this.stackRevision.value;
    const key = this.stack.length ? this.stack[this.stack.length - 1].key : null;
    const def = key ? this.defs.get(key) : undefined;
    if (!def || !TRAP_GROUPS[def.group || ""]) return null;
    return byId(def.id);
  });

  private readonly trap = useFocusTrap(() => [this.trapPanel.value], {
    escapeDeactivates: false,
    returnFocusOnDeactivate: false,
    allowOutsideClick: true,
    initialFocus: () => this.initialFocusTarget(),
    fallbackFocus: () => this.trapPanel.value || document.body,
  });

  constructor() {
    watch(
      this.trapPanel,
      () => {
        if (this.trap.hasFocus.value) this.trap.deactivate();
        if (!this.trapPanel.value) return;
        this.trap.activate();
      },
      { flush: "post" },
    );
    useEventListener(
      document,
      "keydown",
      (event) => {
        if (event.defaultPrevented || event.key !== "Escape") return;
        if (!this.closeTop()) return;
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true },
    );
  }

  register(key: OverlayKey, def: PopoverDef): void {
    this.defs.set(key, def);
    if (this.openState[key] === undefined) this.openState[key] = false;
    if (getCurrentInstance()) onUnmounted(() => this.unregister(key));
  }

  unregister(key: OverlayKey): void {
    this.close(key, { restoreFocus: false });
    this.defs.delete(key);
    delete this.openState[key];
  }

  isOpen(key: OverlayKey): boolean {
    return !!this.openState[key];
  }

  anyOpen(): boolean {
    return this.stack.length > 0;
  }

  toggle(key: OverlayKey, trigger?: HTMLElement | null): boolean {
    return this.isOpen(key) ? this.close(key) : this.open(key, { trigger });
  }

  triggerOf(key: OverlayKey): HTMLElement | null {
    const def = this.defs.get(key);
    return def && def.triggerId ? byId(def.triggerId) : null;
  }

  open(
    key: OverlayKey,
    options?: {
      trigger?: HTMLElement | null;
      keep?: OverlayKey[];
      autofocus?: string;
      placement?: Placement;
    },
  ): boolean {
    const opts = options || {};
    const def = this.defs.get(key);
    if (!def) return false;
    const panel = byId(def.id);
    if (!panel) return false;

    const keep = (def.keep || []).concat(opts.keep || []);
    for (let index = this.stack.length - 1; index >= 0; index--) {
      const layer = this.stack[index];
      if (layer.key === key || keep.indexOf(layer.key) >= 0) continue;
      this.close(layer.key, { restoreFocus: false });
    }

    const anchor = this.anchorOf(def, opts.trigger);
    this.openState[key] = true;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");

    const existing = this.stack.find((layer) => layer.key === key);
    if (!existing) {
      this.stack.push({
        key,
        trigger: anchor || (document.activeElement as HTMLElement | null),
        focusInside: panel.contains(document.activeElement),
      });
    } else if (anchor) {
      existing.trigger = anchor;
    }

    const placement = opts.placement || def.placement;
    if (placement) def.placement = placement;
    if (def.placement) this.place(panel, anchor, def.placement);
    this.stackRevision.value++;

    if (!existing) {
      const autofocus = opts.autofocus || def.autofocus || "";
      const target = autofocus ? byId(autofocus) : null;
      if (target) target.focus({ preventScroll: true });
      if (TRAP_GROUPS[def.group || ""]) this.pendingAutofocus = autofocus;
    }

    this.watchOutside(key, panel, def);
    if (typeof def.onOpen === "function") def.onOpen();
    return true;
  }

  close(key: OverlayKey, options?: { restoreFocus?: boolean }): boolean {
    const opts = options || {};
    this.stopOutside(key);
    const def = this.defs.get(key);
    const index = this.stack.findIndex((layer) => layer.key === key);
    this.openState[key] = false;
    if (def && typeof def.onHide === "function") def.onHide();
    if (index < 0) return false;
    const layer = this.stack.splice(index, 1)[0];
    this.stackRevision.value++;
    if (this.trap.hasFocus.value) this.trap.deactivate();
    if (opts.restoreFocus && !layer.focusInside) this.restoreFocus(layer.trigger);
    return true;
  }

  place(panel: HTMLElement | null, trigger: HTMLElement | null, options?: Placement): void {
    if (!panel) return;
    const def = this.defOfPanel(panel);
    if (sheetMode.value && !def?.float) {
      panel.style.position = "";
      panel.style.left = "";
      panel.style.top = "";
      panel.style.width = "";
      panel.style.maxHeight = "";
      panel.style.margin = "";
      panel.classList.remove("is-overlay");
      return;
    }
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
    void computePosition(trigger ?? virtualAnchor(margin), panel, {
      strategy: "fixed",
      placement: floatingSide(opts),
      middleware,
    }).then((result) => {
      panel.style.left = `${Math.round(result.x)}px`;
      panel.style.top = `${Math.round(result.y)}px`;
    });
  }

  private defOfPanel(panel: HTMLElement): PopoverDef | undefined {
    for (const def of this.defs.values()) {
      if (def.id === panel.id) return def;
    }
    return undefined;
  }

  private anchorOf(def: PopoverDef, explicit?: HTMLElement | null): HTMLElement | null {
    if (explicit) return explicit;
    return def.triggerId ? byId(def.triggerId) : null;
  }

  private initialFocusTarget(): HTMLElement | false {
    const autofocus = this.pendingAutofocus;
    this.pendingAutofocus = "";
    return (autofocus ? byId(autofocus) : null) || this.trapPanel.value || false;
  }

  private closeTop(): boolean {
    const top = this.stack.length ? this.stack[this.stack.length - 1].key : null;
    return top ? this.close(top, { restoreFocus: true }) : false;
  }

  private watchOutside(key: OverlayKey, panel: HTMLElement, def: PopoverDef): void {
    this.stopOutside(key);
    if (!AUTO_CLOSE_GROUPS[def.group || ""]) return;
    const anchor = this.anchorOf(def);
    this.outsideStops.set(
      key,
      onClickOutside(
        panel,
        (event) => {
          const target = event.target as Node | null;
          if (!target || panel.contains(target) || (anchor && anchor.contains(target))) return;
          this.close(key, { restoreFocus: false });
        },
        { ignore: [panel, ...(anchor ? [anchor] : [])] },
      ),
    );
  }

  private stopOutside(key: OverlayKey): void {
    const stop = this.outsideStops.get(key);
    this.outsideStops.delete(key);
    if (stop) stop();
  }

  private restoreFocus(trigger: HTMLElement | null): void {
    if (!trigger || !trigger.isConnected || (trigger as HTMLButtonElement).disabled) return;
    this.clearRing();
    trigger.classList.add("is-focus-silent");
    const clear = () => {
      if (this.ringSuppressor === clear) this.ringSuppressor = null;
      trigger.classList.remove("is-focus-silent");
      document.removeEventListener("keydown", clear, true);
      document.removeEventListener("pointerdown", clear, true);
      trigger.removeEventListener("blur", clear);
    };
    this.ringSuppressor = clear;
    document.addEventListener("keydown", clear, true);
    document.addEventListener("pointerdown", clear, true);
    trigger.addEventListener("blur", clear, { once: true });
    try {
      trigger.focus({ preventScroll: true });
    } catch {
      this.clearRing();
    }
  }

  private clearRing(): void {
    const current = this.ringSuppressor;
    this.ringSuppressor = null;
    if (current) current();
  }
}

export const popovers = new PopoverHost();
