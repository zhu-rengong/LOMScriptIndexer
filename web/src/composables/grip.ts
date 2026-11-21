import { useDragValue } from "./useDragValue";
import { clamp } from "../lib/math";

const prefs = usePrefsStore(pinia);
const view = useViewStore(pinia);

export const createGripController = (
  readerRef: Ref<HTMLElement | null>,
  stageRef: Ref<HTMLElement | null>,
  railRef: Ref<HTMLElement | null>,
) => {
  const currentWidth = (): number =>
    readerRef.value ? Math.round(readerRef.value.getBoundingClientRect().width) : 0;

  const availableWidth = (): number => {
    const stage = stageRef.value;
    if (!stage) return 0;
    const overlayRail = view.layout === "compact" || view.layout === "mobile";
    const railWidth =
      !overlayRail && railRef.value ? railRef.value.getBoundingClientRect().width : 0;
    return Math.max(0, stage.clientWidth - railWidth);
  };

  const clampMeasure = (value: number): number => {
    const range = prefs.limits.measure;
    const room = Math.max(range.min, Math.min(range.max, availableWidth() - 32));
    const max = Math.max(room, Math.min(range.max, currentWidth()));
    return Math.round(clamp(value, range.min, max));
  };

  const applyMeasure = (value: number): void => {
    document.documentElement.style.setProperty("--reader-measure", `${value}px`);
  };

  const commitMeasure = (value: number): void => {
    applyMeasure(value);
    prefs.set({ measure: value });
  };

  let edge: "left" | "right" = "right";
  let origin = 0;

  const drag = useDragValue({
    measure: () => ({ width: currentWidth(), height: 0 }),
    apply: ({ dx }, state) => {
      const delta = state.startValue + dx;
      const next = edge === "left" ? origin - delta * 2 : origin + delta * 2;
      applyMeasure(clampMeasure(next));
    },
    finish: () => commitMeasure(clampMeasure(currentWidth())),
  });

  const start = (side: "left" | "right", event: PointerEvent): void => {
    edge = side;
    origin = currentWidth();
    drag.target.value = readerRef.value;
    drag.start(event, 0);
  };

  return {
    start,
    dragging: drag.dragging,
    reset: () => commitMeasure(clampMeasure(prefs.limits.measure.fallback)),
    nudge: (step: number) => commitMeasure(clampMeasure(currentWidth() + step)),
    applyMeasure,
    currentWidth,
  };
};
