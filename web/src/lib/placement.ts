import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import type { Middleware, Placement as FloatingPlacement } from "@floating-ui/dom";

const MARGIN = 12;
const GAP = 8;
const MIN_HEIGHT = 120;
const HEIGHT_RATIO = 0.6;

const heights = new WeakMap<HTMLElement, number>();

const PLACEMENTS: Record<"start" | "center" | "end", FloatingPlacement> = {
  start: "bottom-start",
  center: "bottom",
  end: "bottom-end",
};

export type Placement = {
  align?: "start" | "center" | "end";
  width?: number;
  matchWidth?: boolean;
  gap?: number;
  margin?: number;
};

const floatingSide = (options: Placement): FloatingPlacement =>
  PLACEMENTS[options.align === "start" ? "start" : options.align === "center" ? "center" : "end"];

const clamp = (value: number, min: number, max: number): number =>
  Math.round(Math.min(Math.max(value, min), Math.max(min, max)));

export const placePanel = (
  panel: HTMLElement,
  reference: HTMLElement,
  options: Placement,
): boolean => {
  const rect = reference.getBoundingClientRect();
  if (!rect.width && !rect.height) return false;
  const margin = options.margin ?? MARGIN;
  const gap = options.gap ?? GAP;
  const available = window.innerWidth - margin * 2;
  const preferred = options.width ?? (options.matchWidth ? Math.round(rect.width) : 0);
  const width = preferred > 0 ? Math.min(preferred, available) : 0;
  const roomBelow = window.innerHeight - rect.bottom - gap - margin;
  const roomAbove = rect.top - gap - margin;
  const below = roomBelow >= roomAbove;
  const maxHeight = Math.max(MIN_HEIGHT, Math.floor(below ? roomBelow : roomAbove));
  const height = Math.min(heights.get(panel) ?? maxHeight * HEIGHT_RATIO, maxHeight);
  const align = options.align === "center" ? "center" : options.align === "end" ? "end" : "start";
  const span = width || Math.min(panel.offsetWidth || available, available);
  const edge =
    align === "center"
      ? rect.left + rect.width / 2 - span / 2
      : align === "end"
        ? rect.right - span
        : rect.left;
  const x = clamp(edge, margin, window.innerWidth - span - margin);
  const y = below
    ? Math.round(rect.bottom + gap)
    : Math.max(margin, Math.round(rect.top - gap - height));
  if (width > 0) panel.style.setProperty("--pop-w", `${Math.round(width)}px`);
  panel.style.setProperty("--pop-max-h", `${maxHeight}px`);
  panel.style.setProperty("--pop-x", `${x}px`);
  panel.style.setProperty("--pop-y", `${y}px`);
  panel.classList.add("is-placed");
  panel.dataset.positioned = "true";
  return true;
};

export const clearPlacement = (panel: HTMLElement): void => {
  panel.style.removeProperty("--pop-x");
  panel.style.removeProperty("--pop-y");
  panel.style.removeProperty("--pop-w");
  panel.style.removeProperty("--pop-max-h");
  delete panel.dataset.positioned;
};

export const trackPlacement = (
  panel: HTMLElement,
  reference: HTMLElement,
  options: Placement,
): (() => void) => {
  const margin = options.margin ?? MARGIN;
  const gap = options.gap ?? GAP;
  const middleware: Middleware[] = [
    offset(gap),
    flip({ padding: margin }),
    shift({ padding: margin }),
    size({
      padding: margin,
      apply({ availableWidth, availableHeight, rects, elements }) {
        const width = options.width
          ? Math.min(options.width, availableWidth)
          : options.matchWidth
            ? Math.min(rects.reference.width, availableWidth)
            : 0;
        if (width > 0) elements.floating.style.setProperty("--pop-w", `${Math.round(width)}px`);
        elements.floating.style.setProperty(
          "--pop-max-h",
          `${Math.max(MIN_HEIGHT, Math.floor(availableHeight))}px`,
        );
      },
    }),
  ];

  let active = true;

  const update = (): void => {
    void computePosition(reference, panel, {
      strategy: "fixed",
      placement: floatingSide(options),
      middleware,
    })
      .then(({ x, y }) => {
        if (!active) return;
        panel.style.setProperty("--pop-x", `${Math.round(x)}px`);
        panel.style.setProperty("--pop-y", `${Math.round(y)}px`);
        panel.dataset.positioned = "true";
        const height = panel.offsetHeight;
        if (height > 0) heights.set(panel, height);
      })
      .catch(() => undefined);
  };

  const stop = autoUpdate(reference, panel, update);

  return () => {
    active = false;
    stop();
  };
};
