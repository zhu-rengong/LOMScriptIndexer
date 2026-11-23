import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import type { Middleware, Placement as FloatingPlacement } from "@floating-ui/dom";

const MARGIN = 12;
const GAP = 8;

export type Placement = {
  align?: "start" | "center" | "end";
  width?: number;
  matchWidth?: boolean;
  gap?: number;
  margin?: number;
};

const floatingSide = (options: Placement): FloatingPlacement => {
  const align = options.align === "start" ? "start" : options.align === "center" ? "" : "end";
  return (align ? `bottom-${align}` : "bottom") as FloatingPlacement;
};

export const placePanel = (
  panel: HTMLElement,
  reference: HTMLElement,
  options: Placement,
): void => {
  const margin = options.margin ?? MARGIN;
  const gap = options.gap ?? GAP;
  const rect = reference.getBoundingClientRect();
  const width = options.width || (options.matchWidth ? Math.round(rect.width) : 0);
  const room = Math.max(rect.top - margin, window.innerHeight - rect.bottom - gap - margin);
  if (width > 0) panel.style.setProperty("--pop-w", `${width}px`);
  panel.style.setProperty("--pop-x", `${Math.round(rect.left)}px`);
  panel.style.setProperty("--pop-y", `${Math.round(rect.bottom + gap)}px`);
  panel.style.setProperty("--pop-max-h", `${Math.max(120, Math.floor(room))}px`);
};

export const trackPlacement = (
  panel: HTMLElement,
  reference: HTMLElement,
  options: Placement,
): (() => void) => {
  const margin = options.margin ?? MARGIN;
  const gap = options.gap ?? GAP;
  placePanel(panel, reference, options);
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
          `${Math.max(120, Math.floor(availableHeight))}px`,
        );
      },
    }),
  ];

  const update = (): void => {
    void computePosition(reference, panel, {
      strategy: "fixed",
      placement: floatingSide(options),
      middleware,
    }).then(({ x, y }) => {
      panel.style.setProperty("--pop-x", `${Math.round(x)}px`);
      panel.style.setProperty("--pop-y", `${Math.round(y)}px`);
    });
  };

  const stop = autoUpdate(reference, panel, update);

  return () => {
    stop();
    panel.style.removeProperty("--pop-x");
    panel.style.removeProperty("--pop-y");
    panel.style.removeProperty("--pop-w");
    panel.style.removeProperty("--pop-max-h");
  };
};
