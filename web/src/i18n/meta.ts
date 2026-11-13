import type { LanguageMeta } from "./types";

export const languageMeta: Record<string, LanguageMeta> = {
  "zh-tw": { native: "繁體中文", html: "zh-Hant", label: "Traditional Chinese", short: "繁中" },
  "zh-cn": {
    native: "简体中文",
    html: "zh-Hans",
    label: "Simplified Chinese",
    short: "简中",
    opencc: {
      from: "tw",
      to: "cn",
      variants: "妳 你|姪 侄|吶 呐|揹 背|拚 拼|薰 熏|搧 扇|炁 气|砲 炮",
    },
  },
  en: { native: "English", html: "en", label: "English", short: "EN" },
};
