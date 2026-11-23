import { useEventListener } from "@vueuse/core";
import { useFocusTrap } from "@vueuse/integrations/useFocusTrap";
import { router } from "../router";
import type { OverlayKey } from "../ui/ids";
import { byId } from "./dom";
import { clearPlacement, placePanel, trackPlacement } from "./placement";
import type { Placement } from "./placement";

type LayerGroup = "menu" | "pop" | "sheet" | "modal";

export type OverlayPayload = {
  kind?: string;
  key?: string;
  method?: string;
};

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
const EMPTY_PAYLOAD: OverlayPayload = {};

export class PopoverHost {
  private readonly defs = shallowRef(new Map<OverlayKey, PopoverDef>());
  private readonly triggers = new Map<OverlayKey, HTMLElement>();
  private readonly stops = new Map<OverlayKey, () => void>();
  private readonly stack = ref<OverlayKey[]>([]);
  private readonly payloads = shallowRef<Partial<Record<OverlayKey, OverlayPayload>>>({});
  private applied: OverlayKey[] = [];
  private focusKey: OverlayKey | null = null;

  private readonly chain = computed<OverlayKey[]>(() => {
    const top = this.stack.value[0];
    return top ? this.chainOf(top) : [];
  });

  private readonly trapPanel = computed<HTMLElement | null>(() => {
    const top = this.chain.value[0];
    const def = top ? this.defs.value.get(top) : undefined;
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
      () => router.currentRoute.value.fullPath,
      () => {
        if (!this.stack.value.length) return;
        this.focusKey = null;
        this.stack.value = [];
      },
    );
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
    const defs = new Map(this.defs.value);
    defs.set(key, def);
    this.defs.value = defs;
    if (getCurrentInstance()) onUnmounted(() => this.unregister(key));
  }

  unregister(key: OverlayKey): void {
    this.stack.value = this.stack.value.filter((item) => item !== key);
    this.clearPayload(key);
    this.triggers.delete(key);
    const defs = new Map(this.defs.value);
    defs.delete(key);
    this.defs.value = defs;
  }

  isOpen(key: OverlayKey): boolean {
    return this.chain.value.indexOf(key) >= 0;
  }

  anyOpen(): boolean {
    return this.chain.value.length > 0;
  }

  triggerOf(key: OverlayKey): HTMLElement | null {
    const def = this.defs.value.get(key);
    return def ? this.triggerFor(key, def) : null;
  }

  payload(key: OverlayKey): OverlayPayload {
    return this.payloads.value[key] ?? EMPTY_PAYLOAD;
  }

  toggle(key: OverlayKey, trigger?: HTMLElement | null): boolean {
    return this.isOpen(key) ? this.close(key) : this.open(key, { trigger });
  }

  open(key: OverlayKey, options?: OpenOptions): boolean {
    const def = this.defs.value.get(key);
    if (!def) return false;
    const opts = options || {};
    const trigger = opts.trigger || null;
    const wasTop = this.chain.value[0] === key;

    if (trigger && !byId(def.id)?.contains(trigger)) {
      const changed = this.triggers.get(key) !== trigger;
      this.triggers.set(key, trigger);
      const positioned = byId(def.id)?.dataset.positioned === "true";
      if (changed || !wasTop || !positioned) this.place(key, trigger);
    }

    this.setPayload(key, opts.payload);
    this.stack.value = this.chainOf(key);
    return true;
  }

  close(key: OverlayKey): boolean {
    const index = this.stack.value.indexOf(key);
    if (index < 0) return false;
    this.stack.value = this.stack.value.slice(index + 1);
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
    const chain = this.chain.value;
    if (!chain.length) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.inside(chain, target) || this.onTrigger(target)) return;
    const auto = chain.filter((key) =>
      AUTO_CLOSE_GROUPS.has(this.defs.value.get(key)?.group || ""),
    );
    const last = auto[auto.length - 1];
    if (last) this.close(last);
  };

  private readonly sync = (): void => {
    const chain = this.chain.value;
    const opened = chain.filter((key) => this.applied.indexOf(key) < 0);
    const closed = this.applied.filter((key) => chain.indexOf(key) < 0);
    for (const key of closed) this.deactivate(key);
    for (const key of opened.reverse()) this.activate(key);
    this.applied = chain;
  };

  private activate(key: OverlayKey): void {
    const def = this.defs.value.get(key);
    if (!def) return;
    const panel = def.placement ? byId(def.id) : null;
    const trigger = panel ? this.triggerFor(key, def) : null;
    if (panel && trigger && def.placement) {
      if (panel.dataset.positioned !== "true") this.place(key, trigger);
      else this.track(key, panel, trigger, def.placement);
    }
    if (def.autofocus) byId(def.autofocus)?.focus({ preventScroll: true });
    if (typeof def.onOpen === "function") def.onOpen();
  }

  private place(key: OverlayKey, trigger: HTMLElement): void {
    const def = this.defs.value.get(key);
    if (!def?.placement) return;
    const panel = byId(def.id);
    if (!panel || panel.contains(trigger)) return;
    this.release(key);
    if (!placePanel(panel, trigger, def.placement)) return;
    if (this.isOpen(key)) this.track(key, panel, trigger, def.placement);
  }

  private track(
    key: OverlayKey,
    panel: HTMLElement,
    trigger: HTMLElement,
    placement: Placement,
  ): void {
    this.release(key);
    this.stops.set(key, trackPlacement(panel, trigger, placement));
  }

  private deactivate(key: OverlayKey): void {
    const def = this.defs.value.get(key);
    this.release(key);
    const panel = def ? byId(def.id) : null;
    if (panel) clearPlacement(panel);
    if (def && typeof def.onHide === "function") def.onHide();
    this.clearPayload(key);
    if (this.focusKey !== key) return;
    this.focusKey = null;
    if (!def) return;
    const trigger = this.triggerFor(key, def);
    if (!trigger || !trigger.isConnected) return;
    if (trigger instanceof HTMLButtonElement && trigger.disabled) return;
    trigger.focus({ preventScroll: true });
  }

  private release(key: OverlayKey): void {
    const stop = this.stops.get(key);
    this.stops.delete(key);
    if (stop) stop();
  }

  private setPayload(key: OverlayKey, payload?: OverlayPayload): void {
    const next = { ...this.payloads.value };
    if (payload) next[key] = { ...payload };
    else delete next[key];
    this.payloads.value = next;
  }

  private clearPayload(key: OverlayKey): void {
    if (!(key in this.payloads.value)) return;
    const next = { ...this.payloads.value };
    delete next[key];
    this.payloads.value = next;
  }

  private chainOf(top: OverlayKey | null): OverlayKey[] {
    if (!top || !this.defs.value.has(top)) return [];
    const keys: OverlayKey[] = [top];
    for (let index = 0; index < keys.length; index++) {
      const def = this.defs.value.get(keys[index]);
      for (const parent of def?.keep || []) {
        if (keys.indexOf(parent) < 0 && this.defs.value.has(parent)) keys.push(parent);
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
      const def = this.defs.value.get(key);
      if (!def) continue;
      if (byId(def.id)?.contains(target)) return true;
      if (this.triggerFor(key, def)?.contains(target)) return true;
    }
    return false;
  }

  private onTrigger(target: Node): boolean {
    for (const [key, def] of this.defs.value) {
      if (this.triggerFor(key, def)?.contains(target)) return true;
    }
    return false;
  }

  private autofocusTarget(): HTMLElement | null {
    const top = this.chain.value[0];
    const def = top ? this.defs.value.get(top) : undefined;
    if (!def) return null;
    return (def.autofocus ? byId(def.autofocus) : null) || byId(def.id);
  }
}

export const popovers = new PopoverHost();
