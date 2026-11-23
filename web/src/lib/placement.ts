import { autoUpdate, computePosition, flip, offset, shift, size } from "@floating-ui/dom";
import type { Middleware, Placement as FloatingPlacement } from "@floating-ui/dom";

const MARGIN = 12;
const GAP = 8;

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
    })
      .then(({ x, y }) => {
        panel.style.setProperty("--pop-x", `${Math.round(x)}px`);
        panel.style.setProperty("--pop-y", `${Math.round(y)}px`);
        panel.dataset.positioned = "true";
      })
      .catch(() => {
        panel.dataset.positioned = "true";
      });
  };

  const stop = autoUpdate(reference, panel, update);

  return () => {
    stop();
    panel.style.removeProperty("--pop-x");
    panel.style.removeProperty("--pop-y");
    panel.style.removeProperty("--pop-w");
    panel.style.removeProperty("--pop-max-h");
    delete panel.dataset.positioned;
  };
};
