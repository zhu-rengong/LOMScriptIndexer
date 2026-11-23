type LongPressOptions = {
  delay?: number;
  moveTolerance?: number;
  onLongPress: (trigger: HTMLElement | null) => boolean;
};

export const useLongPress = (options: LongPressOptions) => {
  const delay = options.delay ?? 450;
  const tolerance = options.moveTolerance ?? 8;
  let timer = 0;
  let originX = 0;
  let originY = 0;
  let pressed = false;
  let suppressed = false;

  const stop = (): void => {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = 0;
  };

  const cancel = (): void => {
    stop();
    pressed = false;
  };

  const onPointerDown = (event: PointerEvent): void => {
    suppressed = false;
    if (event.pointerType === "mouse" || event.button > 0) return;
    event.stopPropagation();
    cancel();
    pressed = true;
    originX = event.clientX;
    originY = event.clientY;
    const trigger = event.currentTarget as HTMLElement | null;
    timer = window.setTimeout(() => {
      timer = 0;
      if (!pressed) return;
      pressed = false;
      suppressed = options.onLongPress(trigger);
    }, delay);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!pressed) return;
    if (
      Math.abs(event.clientX - originX) > tolerance ||
      Math.abs(event.clientY - originY) > tolerance
    ) {
      cancel();
    }
  };

  const onContextMenu = (event: Event): void => {
    if (!pressed && !suppressed) return;
    event.preventDefault();
  };

  const consume = (): boolean => {
    const fired = suppressed;
    suppressed = false;
    return fired;
  };

  return {
    consume,
    handlers: {
      pointerdown: onPointerDown,
      pointermove: onPointerMove,
      pointerup: cancel,
      pointercancel: cancel,
      pointerleave: cancel,
      contextmenu: onContextMenu,
    },
  };
};
