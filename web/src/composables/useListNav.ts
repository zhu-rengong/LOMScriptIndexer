const KEYS = ["ArrowDown", "ArrowUp", "Home", "End"];

export const useListNav = (host: () => HTMLElement | null, selector: string) => {
  const items = (): HTMLElement[] =>
    Array.from(host()?.querySelectorAll<HTMLElement>(selector) || []);

  const focusAt = (index: number): void => {
    items()[index]?.focus();
  };

  const focusCurrent = (preferred = '[aria-selected="true"]'): void => {
    const list = items();
    const match = list.find((item) => item.matches(preferred)) || list[0];
    match?.focus();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (KEYS.indexOf(event.key) < 0) return;
    const list = items();
    if (!list.length) return;
    event.preventDefault();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (index < 0) {
      focusAt(event.key === "ArrowUp" || event.key === "End" ? list.length - 1 : 0);
      return;
    }
    let next = index;
    if (event.key === "ArrowDown") next = Math.min(list.length - 1, index + 1);
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = list.length - 1;
    focusAt(next);
  };

  return { onKeydown, focusAt, focusCurrent };
};
