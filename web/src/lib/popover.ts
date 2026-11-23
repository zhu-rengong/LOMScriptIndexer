import { useEventListener } from "@vueuse/core";
import { useFocusTrap } from "@vueuse/integrations/useFocusTrap";
import type { LocationQueryRaw, RouteLocationPathRaw } from "vue-router";
import { router } from "../router";
import type { OverlayKey } from "../ui/ids";
import { byId } from "./browser";
import { panelOf, stripPanel, withPanel } from "./overlayRoute";
import type { OverlayPayload } from "./overlayRoute";
import { trackPlacement } from "./placement";
import type { Placement } from "./placement";

type LayerGroup = "menu" | "pop" | "sheet" | "modal";

export type PopoverDef = {
  id: string;
  triggerId?: string;
  group?: LayerGroup;
  keep?: OverlayKey[];
  autofocus?: string;
  placement?: Placement;
  onOpen?: () => void;
  onHide?: () => void;
};

export type OpenOptions = {
  trigger?: HTMLElement | null;
  payload?: OverlayPayload;
};

const TRAP_GROUPS = new Set<string>(["sheet", "modal"]);
const AUTO_CLOSE_GROUPS = new Set<string>(["menu", "pop"]);

export class PopoverHost {
  private readonly defs = new Map<OverlayKey, PopoverDef>();
  private readonly triggers = new Map<OverlayKey, HTMLElement>();
  private readonly stops = new Map<OverlayKey, () => void>();
  private readonly version = ref(0);
  private applied: OverlayKey[] = [];
  private basePosition: number | null = null;
  private focusKey: OverlayKey | null = null;
  private navigating = false;

  private readonly chain = computed<OverlayKey[]>(() => {
    void this.version.value;
    return this.chainOf(panelOf(router.currentRoute.value.query));
  });

  private readonly trapPanel = computed<HTMLElement | null>(() => {
    const top = this.chain.value[0];
    const def = top ? this.defs.get(top) : undefined;
    if (!def || !TRAP_GROUPS.has(def.group || "")) return null;
    return byId(def.id);
  });

  private readonly trap = useFocusTrap(() => [this.trapPanel.value], {
    escapeDeactivates: false,
    returnFocusOnDeactivate: false,
    allowOutsideClick: true,
    initialFocus: () => this.autofocusTarget() || false,
    fallbackFocus: () => this.trapPanel.value || document.body,
  });

  install(): void {
    useEventListener(document, "keydown", this.onKeydown, { capture: true });
    useEventListener(document, "click", this.onClick);
    watch(this.chain, this.sync, { flush: "post", immediate: true });
    watch(
      this.trapPanel,
      (panel) => {
        if (this.trap.hasFocus.value) this.trap.deactivate();
        if (panel) this.trap.activate();
      },
      { flush: "post" },
    );
  }

  register(key: OverlayKey, def: PopoverDef): void {
    this.defs.set(key, def);
    this.version.value++;
    if (getCurrentInstance()) onUnmounted(() => this.unregister(key));
  }

  unregister(key: OverlayKey): void {
    if (panelOf(router.currentRoute.value.query) === key) this.close(key);
    this.triggers.delete(key);
    this.defs.delete(key);
    this.version.value++;
  }

  isOpen(key: OverlayKey): boolean {
    return this.chain.value.indexOf(key) >= 0;
  }

  anyOpen(): boolean {
    return this.chain.value.length > 0;
  }

  triggerOf(key: OverlayKey): HTMLElement | null {
    const def = this.defs.get(key);
    return def ? this.triggerFor(key, def) : null;
  }

  toggle(key: OverlayKey, trigger?: HTMLElement | null): boolean {
    return this.isOpen(key) ? this.close(key) : this.open(key, { trigger });
  }

  open(key: OverlayKey, options?: OpenOptions): boolean {
    const def = this.defs.get(key);
    if (!def) return false;
    const opts = options || {};
    const trigger = opts.trigger || null;
    const current = panelOf(router.currentRoute.value.query);
    const query = withPanel(router.currentRoute.value.query, key, opts.payload);
    const panel = byId(def.id);
    this.navigating = true;
    queueMicrotask(() => {
      this.navigating = false;
    });

    if (current === key) {
      if (trigger && (!panel || !panel.contains(trigger))) this.triggers.set(key, trigger);
      if (router.resolve(this.locationOf(query)).fullPath !== router.currentRoute.value.fullPath) {
        void router.replace(this.locationOf(query));
      }
      return true;
    }

    if (trigger) this.triggers.set(key, trigger);
    if (current && this.chainOf(key).indexOf(current) < 0) {
      void router.replace(this.locationOf(query));
    } else {
      void router.push(this.locationOf(query));
    }
    return true;
  }

  close(key: OverlayKey): boolean {
    const chain = this.chain.value;
    const index = chain.indexOf(key);
    if (index < 0) return false;
    this.dismiss(index + 1);
    return true;
  }

  closeTop(restoreFocus: boolean): boolean {
    const top = this.chain.value[0];
    if (!top) return false;
    this.focusKey = restoreFocus ? top : null;
    return this.close(top);
  }

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.key !== "Escape") return;
    if (!this.closeTop(true)) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onClick = (event: MouseEvent): void => {
    if (this.navigating) return;
    const chain = this.chain.value;
    if (!chain.length) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.inside(chain, target) || this.onTrigger(target)) return;
    const auto = chain.filter((key) => AUTO_CLOSE_GROUPS.has(this.defs.get(key)?.group || ""));
    const last = auto[auto.length - 1];
    if (last) this.close(last);
  };

  private readonly sync = (): void => {
    const chain = this.chain.value;
    if (!chain.length) this.basePosition = this.position();
    const opened = chain.filter((key) => this.applied.indexOf(key) < 0);
    const closed = this.applied.filter((key) => chain.indexOf(key) < 0);
    for (const key of closed) this.deactivate(key);
    for (const key of opened.reverse()) this.activate(key);
    this.applied = chain;
  };

  private activate(key: OverlayKey): void {
    const def = this.defs.get(key);
    if (!def) return;
    const panel = byId(def.id);
    if (panel && def.placement) {
      const trigger = this.triggerFor(key, def);
      if (trigger) {
        panel.classList.add("is-placed");
        this.stops.set(key, trackPlacement(panel, trigger, def.placement));
      }
    }
    if (def.autofocus) byId(def.autofocus)?.focus({ preventScroll: true });
    if (typeof def.onOpen === "function") def.onOpen();
  }

  private deactivate(key: OverlayKey): void {
    const def = this.defs.get(key);
    const stop = this.stops.get(key);
    this.stops.delete(key);
    if (stop) stop();
    const panel = def ? byId(def.id) : null;
    panel?.classList.remove("is-placed");
    if (def && typeof def.onHide === "function") def.onHide();
    if (this.focusKey !== key) return;
    this.focusKey = null;
    if (!def) return;
    const trigger = this.triggerFor(key, def);
    if (!trigger || !trigger.isConnected || (trigger as HTMLButtonElement).disabled) return;
    trigger.focus({ preventScroll: true });
  }

  private dismiss(count: number): void {
    const location = this.locationOf(stripPanel(router.currentRoute.value.query));
    const depth = this.depth();
    if (depth < 1 || count > depth) {
      void router.replace(location);
      return;
    }
    router.go(-count);
  }

  private locationOf(query: LocationQueryRaw): RouteLocationPathRaw {
    return { path: router.currentRoute.value.path, query };
  }

  private depth(): number {
    return this.basePosition === null ? 0 : Math.max(0, this.position() - this.basePosition);
  }

  private position(): number {
    const value = (router.options.history.state as { position?: unknown }).position;
    return typeof value === "number" ? value : 0;
  }

  private chainOf(top: OverlayKey | null): OverlayKey[] {
    if (!top || !this.defs.has(top)) return [];
    const keys: OverlayKey[] = [top];
    for (let index = 0; index < keys.length; index++) {
      const def = this.defs.get(keys[index]);
      for (const parent of def?.keep || []) {
        if (keys.indexOf(parent) < 0 && this.defs.has(parent)) keys.push(parent);
      }
    }
    return keys;
  }

  private triggerFor(key: OverlayKey, def: PopoverDef): HTMLElement | null {
    const stored = this.triggers.get(key);
    if (stored && stored.isConnected) return stored;
    if (!def.triggerId) return null;
    return byId(def.triggerId);
  }

  private inside(chain: OverlayKey[], target: Node): boolean {
    for (const key of chain) {
      const def = this.defs.get(key);
      if (!def) continue;
      if (byId(def.id)?.contains(target)) return true;
      if (this.triggerFor(key, def)?.contains(target)) return true;
    }
    return false;
  }

  private onTrigger(target: Node): boolean {
    for (const [key, def] of this.defs) {
      if (this.triggerFor(key, def)?.contains(target)) return true;
    }
    return false;
  }

  private autofocusTarget(): HTMLElement | null {
    const top = this.chain.value[0];
    const def = top ? this.defs.get(top) : undefined;
    if (!def) return null;
    return (def.autofocus ? byId(def.autofocus) : null) || byId(def.id);
  }
}

export const popovers = new PopoverHost();
