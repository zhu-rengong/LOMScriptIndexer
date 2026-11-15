import { useBrowserLocation } from "@vueuse/core";

export const readHash = (): string | null => {
  const match = /^#\/(.+)$/.exec(location.hash || "");
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

export const writeHash = (id: string): void => {
  if (!window.history || !history.replaceState) return;
  const target = `#/${id}`;
  if (location.hash !== target) history.replaceState(null, "", target);
};

export const useHashRoute = (onChange: (id: string) => void): void => {
  const location = useBrowserLocation();
  watch(
    () => location.value.hash,
    () => {
      const id = readHash();
      if (id) onChange(id);
    },
  );
};
