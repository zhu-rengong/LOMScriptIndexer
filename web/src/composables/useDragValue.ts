import { useEventListener } from "@vueuse/core";
import { ref, shallowRef } from "vue";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startValue: number;
  bounds: { width: number; height: number } | null;
};

type DragOptions = {
  measure: (element: HTMLElement) => { width: number; height: number } | null;
  apply: (value: { dx: number; dy: number }, state: DragState) => void;
  finish?: () => void;
};

export const useDragValue = (options: DragOptions) => {
  const target = shallowRef<HTMLElement | null>(null);
  const dragging = ref(false);
  const state = shallowRef<DragState | null>(null);

  const start = (event: PointerEvent, startValue = 0): void => {
    if (event.button !== 0) return;
    const element = target.value;
    if (!element) return;
    state.value = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      bounds: options.measure(element),
    };
    dragging.value = true;
    element.setPointerCapture(event.pointerId);
    document.body.classList.add("is-gripping");
  };

  const stop = (): void => {
    const current = state.value;
    if (!current) return;
    target.value?.releasePointerCapture?.(current.pointerId);
    state.value = null;
    dragging.value = false;
    document.body.classList.remove("is-gripping");
    options.finish?.();
  };

  useEventListener(
    () => (state.value ? window : null),
    "pointermove",
    (event: PointerEvent) => {
      const current = state.value;
      if (!current || event.pointerId !== current.pointerId) return;
      options.apply(
        { dx: event.clientX - current.startX, dy: event.clientY - current.startY },
        current,
      );
    },
  );

  useEventListener(
    () => (state.value ? window : null),
    ["pointerup", "pointercancel"],
    (event: PointerEvent) => {
      if (state.value && event.pointerId === state.value.pointerId) stop();
    },
  );

  return { target, dragging, state, start, stop };
};
