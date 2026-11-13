export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export type Debounced<A extends unknown[]> = ((...args: A) => void) & { cancel: () => void };

export const debounce = <A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): Debounced<A> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = ((...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  }) as Debounced<A>;
  wrapped.cancel = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  };
  return wrapped;
};

export const scheduleFrame = (fn: () => void): (() => void) => {
  let handle = 0;
  return () => {
    if (handle) return;
    handle = requestAnimationFrame(() => {
      handle = 0;
      fn();
    });
  };
};

export const toNeedle = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

export const formatCount = (value: unknown): string =>
  String(Number(value) || 0).replace(THOUSANDS, ",");

export const signedNumber = (value: number): string => (value > 0 ? `+${value}` : String(value));

export const nearBottom = (node: HTMLElement, threshold: number): boolean =>
  node.scrollHeight - node.scrollTop - node.clientHeight < threshold;

export const focusableElements = (root: HTMLElement): HTMLElement[] => {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(
    (node) => node.offsetParent !== null,
  );
};

export const byId = (id: string): HTMLElement | null => document.getElementById(id);
