export const FOLLOW_BASE = "@base";

export const FOLLOW_GROUP = "@group";

const SERIF =
  '"Source Han Serif TC","Noto Serif TC","Songti TC","Songti SC","STSong",Georgia,"SimSun",serif';

const SANS =
  '"PingFang TC","PingFang SC","Source Han Sans TC","Noto Sans TC","Microsoft JhengHei","Microsoft YaHei",system-ui,sans-serif';

const KAI = `"Kaiti TC","KaiTi","STKaiti","BiauKai","DFKai-SB",${SERIF}`;

const ROUND =
  '"Yuanti TC","Yuanti SC","YouYuan","PingFang TC","PingFang SC","Microsoft YaHei",sans-serif';

const MONO = 'ui-monospace,"Sarasa Mono TC","Cascadia Mono",Consolas,"Courier New",monospace';

export const BASE_FONT = SERIF;

export const DEFAULT_BASE_FONT = "serif";

type FontPreset = { id: string; label: string; stack: string };

const FONTS: FontPreset[] = [
  { id: "serif", label: "pref.font.serif", stack: SERIF },
  { id: "sans", label: "pref.font.sans", stack: SANS },
  { id: "kai", label: "pref.font.kai", stack: KAI },
  { id: "round", label: "pref.font.round", stack: ROUND },
  { id: "mono", label: "pref.font.mono", stack: MONO },
];

const FONT_BY_ID = new Map(FONTS.map((font) => [font.id, font]));

export const fontPreset = (id: string): FontPreset | null => FONT_BY_ID.get(id) || null;

const normalizeFamily = (name: string): string => {
  const value = name.trim();
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

export const fontStackOf = (value: string, base: string = BASE_FONT): string => {
  if (!value || value === FOLLOW_BASE) return base;
  const preset = fontPreset(value);
  if (preset) return preset.stack;
  const direct = normalizeFamily(value);
  return direct ? `${direct},${base}` : base;
};

export const baseFontStack = (value: string): string => {
  if (!value || value === FOLLOW_BASE || value === FOLLOW_GROUP) return BASE_FONT;
  return fontStackOf(value);
};

export const fontLabelKey = (value: string): string => {
  if (!value || value === FOLLOW_BASE) return "pref.followBase";
  if (value === FOLLOW_GROUP) return "pref.followGroup";
  const preset = fontPreset(value);
  return preset ? preset.label : value;
};
