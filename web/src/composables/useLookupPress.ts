import { onLongPress } from "@vueuse/core";

export const useLookupPress = (open: (target: HTMLElement | null) => void) => {
  const target = ref<HTMLElement | null>(null);
  let fired = false;

  const consume = (): boolean => {
    const value = fired;
    fired = false;
    return value;
  };

  onLongPress(
    target,
    (event) => {
      if (event.pointerType === "mouse") return;
      open(target.value);
    },
    {
      delay: 450,
      distanceThreshold: 8,
      onMouseUp: (_duration, _distance, isLongPress, event) => {
        fired = isLongPress && event.pointerType !== "mouse";
      },
    },
  );

  return { target, consume };
};
