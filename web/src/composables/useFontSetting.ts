import { t } from "../i18n";
import { FOLLOW_BASE, FOLLOW_GROUP, fontPreset } from "../lib/fontFamilies";
import { fonts } from "../lib/systemFonts";
import { usePrefsStore } from "../stores/prefs";
import type { FontTarget } from "../types/font";

export type FontSource = "follow" | "preset" | "system" | "manual";

export const useFontSetting = (target: () => FontTarget) => {
  const prefs = usePrefsStore();

  const current = computed(() => {
    const entry = target();
    if (entry.scope === "group") return prefs.groups[entry.id]?.font || FOLLOW_BASE;
    return prefs.slots[entry.id]?.font || FOLLOW_GROUP;
  });

  const source = computed<FontSource>(() => {
    const value = current.value;
    if (!value || value === FOLLOW_BASE || value === FOLLOW_GROUP) return "follow";
    if (fontPreset(value)) return "preset";
    return fonts.families().indexOf(value) >= 0 ? "system" : "manual";
  });

  const label = computed(() => t(prefs.fontLabelKeyOf(target())));

  const followValue = computed(() => (target().scope === "group" ? FOLLOW_BASE : FOLLOW_GROUP));

  const apply = (value: string): void => {
    const entry = target();
    if (entry.scope === "group") {
      prefs.set({ groups: { [entry.id]: { font: value } } });
      return;
    }
    prefs.set({ slots: { [entry.id]: { font: value } } });
  };

  return { current, source, label, followValue, apply };
};
