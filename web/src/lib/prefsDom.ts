import { usePreferredDark } from "@vueuse/core";
import { watch } from "vue";
import type { CapsMode, ResolvedTypeStyle, ThemeMode } from "../types/font";

export type PrefsSnapshot = {
  baseStack: string;
  measure: number;
  portraitSize: number;
  readerZoom: number;
  theme: ThemeMode;
  slots: ResolvedTypeStyle[];
};

const capsTokens = (caps: CapsMode): [string, string] => {
  if (caps === "upper") return ["uppercase", "normal"];
  if (caps === "small") return ["none", "small-caps"];
  return ["none", "normal"];
};

const applyTheme = (mode: ThemeMode, prefersDark: boolean): void => {
  const dark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
};

const applyPrefs = (snapshot: PrefsSnapshot): void => {
  const root = document.documentElement;
  root.style.setProperty("--font-base", snapshot.baseStack);
  root.style.setProperty("--reader-measure", `${snapshot.measure}px`);
  root.style.setProperty("--rd-portrait-w", `${snapshot.portraitSize}px`);
  root.style.setProperty("--reader-zoom", (snapshot.readerZoom / 100).toFixed(3));
  root.style.setProperty("--reader-zoom-inv", (100 / snapshot.readerZoom).toFixed(4));
  for (const style of snapshot.slots) {
    const [transform, variant] = capsTokens(style.caps);
    root.style.setProperty(`--rd-ff-${style.id}`, style.fontStack);
    root.style.setProperty(`--rd-fs-${style.id}`, `${style.px.toFixed(2)}px`);
    root.style.setProperty(`--rd-lh-${style.id}`, style.lineHeight.toFixed(3));
    root.style.setProperty(`--rd-fw-${style.id}`, String(style.weight));
    root.style.setProperty(`--rd-ls-${style.id}`, `${style.tracking.toFixed(3)}em`);
    root.style.setProperty(`--rd-fi-${style.id}`, style.italic ? "italic" : "normal");
    root.style.setProperty(`--rd-tt-${style.id}`, transform);
    root.style.setProperty(`--rd-fc-${style.id}`, variant);
    root.style.setProperty(`--rd-fn-${style.id}`, style.numeric ? "tabular-nums" : "normal");
  }
};

export const applyReaderMeasure = (value: number): void => {
  document.documentElement.style.setProperty("--reader-measure", `${value}px`);
};

export const installPrefsDom = (source: { snapshot: PrefsSnapshot }): void => {
  const dark = usePreferredDark();
  watch(
    [() => source.snapshot, dark],
    ([snapshot, isDark]) => {
      applyPrefs(snapshot);
      applyTheme(snapshot.theme, isDark);
    },
    { flush: "post", immediate: true },
  );
};
