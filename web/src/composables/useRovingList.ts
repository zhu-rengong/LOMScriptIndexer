import { clampIndex, stepIndex } from "../lib/listNav";

type RovingListOptions = {
  container: Ref<HTMLElement | null>;
  selector: string;
  wrap?: boolean;
};

const HANDLED_KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

export const useRovingList = (options: RovingListOptions) => {
  const itemsOf = (): HTMLElement[] =>
    Array.from(options.container.value?.querySelectorAll<HTMLElement>(options.selector) ?? []);

  const onKeydown = (event: KeyboardEvent): void => {
    if (HANDLED_KEYS.indexOf(event.key) < 0) return;
    const items = itemsOf();
    if (!items.length) return;
    const current = items.findIndex((item) => item === document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    if (event.key === "Home") {
      items[0]?.focus();
      return;
    }
    if (event.key === "End") {
      items[items.length - 1]?.focus();
      return;
    }
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = stepIndex(current, step, items.length, options.wrap === true);
    items[clampIndex(next, items.length)]?.focus();
  };

  const focusInitial = async (selectedSelector?: string): Promise<void> => {
    await nextTick();
    const container = options.container.value;
    if (!container) return;
    const selected = selectedSelector
      ? container.querySelector<HTMLElement>(selectedSelector)
      : null;
    (selected ?? container.querySelector<HTMLElement>(options.selector))?.focus();
  };

  return { onKeydown, focusInitial };
};
