import { t, tOr } from "../i18n";
import { FOLLOW_BASE, FOLLOW_GROUP, fontPreset } from "../lib/fontFamilies";
import { fontDisplayName, systemFamilyNames } from "../lib/systemFonts";
import type { FontTarget } from "../types/font";

type FontSource = "follow" | "preset" | "system" | "manual";

export const useFontSetting = (target: () => FontTarget) => {
  const prefs = usePrefsStore();

  const current = computed(() => {
    const entry = target();
    if (entry.scope === "base") return prefs.baseFont;
    if (entry.scope === "group") return prefs.groups[entry.id]?.font || FOLLOW_BASE;
    return prefs.slots[entry.id]?.font || FOLLOW_GROUP;
  });

  const source = computed<FontSource>(() => {
    const value = current.value;
    if (!value || value === FOLLOW_BASE || value === FOLLOW_GROUP) return "follow";
    if (fontPreset(value)) return "preset";
    return systemFamilyNames.value.has(value) ? "system" : "manual";
  });

  const label = computed(() => {
    const key = prefs.fontLabelKeyOf(target());
    return tOr(key, fontDisplayName(key));
  });

  const followValue = computed(() => (target().scope === "group" ? FOLLOW_BASE : FOLLOW_GROUP));

  const followLabel = computed(() =>
    t(target().scope === "group" ? prefs.labels.followBase : prefs.labels.followGroup),
  );

  const apply = (value: string): void => {
    const entry = target();
    if (entry.scope === "base") {
      prefs.set({ baseFont: value });
      return;
    }
    if (entry.scope === "group") {
      prefs.set({ groups: { [entry.id]: { font: value } } });
      return;
    }
    prefs.set({ slots: { [entry.id]: { font: value } } });
  };

  return { current, source, label, followValue, followLabel, apply };
};
