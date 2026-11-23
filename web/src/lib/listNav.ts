export const clampIndex = (index: number, count: number): number => {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
};

export const stepIndex = (current: number, step: number, count: number, wrap: boolean): number => {
  if (count <= 0) return 0;
  if (wrap) return (current + step + count) % count;
  return clampIndex(current + step, count);
};

export const focusAt = (
  container: HTMLElement | null,
  selector: string,
  index: number,
): boolean => {
  const item = container?.querySelectorAll<HTMLElement>(selector)[index];
  if (!item) return false;
  item.focus();
  return true;
};

export const scrollAt = (container: HTMLElement | null, selector: string, index: number): void => {
  const item = container?.querySelectorAll<HTMLElement>(selector)[index];
  item?.scrollIntoView({ block: "nearest" });
};
