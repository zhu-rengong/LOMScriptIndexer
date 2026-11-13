export const FOLLOW_BASE = "@base";

export const FOLLOW_GROUP = "@group";

export const SERIF =
  '"Source Han Serif TC","Noto Serif TC","Songti TC","Songti SC","STSong",Georgia,"SimSun",serif';

export const SANS =
  '"PingFang TC","PingFang SC","Source Han Sans TC","Noto Sans TC","Microsoft JhengHei","Microsoft YaHei",system-ui,sans-serif';

export const KAI = `"Kaiti TC","KaiTi","STKaiti","BiauKai","DFKai-SB",${SERIF}`;

export const ROUND =
  '"Yuanti TC","Yuanti SC","YouYuan","PingFang TC","PingFang SC","Microsoft YaHei",sans-serif';

export const MONO =
  'ui-monospace,"Sarasa Mono TC","Cascadia Mono",Consolas,"Courier New",monospace';

export const BASE_FONT = SERIF;

export type FontPreset = { id: string; label: string; stack: string };

export const FONTS: FontPreset[] = [
  { id: "serif", label: "pref.font.serif", stack: SERIF },
  { id: "sans", label: "pref.font.sans", stack: SANS },
  { id: "kai", label: "pref.font.kai", stack: KAI },
  { id: "round", label: "pref.font.round", stack: ROUND },
  { id: "mono", label: "pref.font.mono", stack: MONO },
];

const FONT_BY_ID = new Map(FONTS.map((font) => [font.id, font]));

export const fontPreset = (id: string): FontPreset | null => FONT_BY_ID.get(id) || null;

const normalizeFamily = (name: string): string => {
  const value = String(name || "").trim();
  if (!value) return "";
  if (/^["']/.test(value)) return value;
  return value
    .split(",")
    .map((part) => {
      const piece = part.trim();
      if (!piece) return "";
      return /\s/.test(piece) ? `"${piece.replace(/"/g, "")}"` : piece;
    })
    .filter(Boolean)
    .join(",");
};

export const fontStackOf = (value: unknown): string => {
  if (!value || value === FOLLOW_BASE) return BASE_FONT;
  const preset = fontPreset(String(value));
  if (preset) return preset.stack;
  const direct = normalizeFamily(String(value));
  return direct ? `${direct},${BASE_FONT}` : BASE_FONT;
};

export const fontLabelKey = (value: string): string => {
  if (!value || value === FOLLOW_BASE) return "pref.followBase";
  if (value === FOLLOW_GROUP) return "pref.followGroup";
  const preset = fontPreset(value);
  return preset ? preset.label : value;
};
