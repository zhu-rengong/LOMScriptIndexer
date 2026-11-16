import { normalizeSearchText } from "./browser";

const GENERIC_STACK = new Set(["serif", "sans-serif", "monospace", "system-ui", "ui-monospace"]);

const ALIAS_GROUPS: string[][] = [
  ["Microsoft YaHei", "微软雅黑", "微軟雅黑"],
  ["Microsoft YaHei UI", "微软雅黑 UI", "微軟雅黑 UI"],
  ["Microsoft JhengHei", "微软正黑体", "微軟正黑體"],
  ["Microsoft JhengHei UI", "微软正黑体 UI", "微軟正黑體 UI"],
  ["SimSun", "宋体", "宋體", "中易宋体", "中易宋體"],
  ["SimSun-ExtB", "宋体-ExtB", "宋體-ExtB"],
  ["NSimSun", "新宋体", "新宋體"],
  ["SimHei", "黑体", "黑體", "中易黑体", "中易黑體"],
  ["KaiTi", "楷体", "楷體", "中易楷体", "中易楷體"],
  ["FangSong", "仿宋", "仿宋体", "仿宋體"],
  ["DengXian", "等线", "等線"],
  ["YouYuan", "幼圆", "幼圓"],
  ["LiSu", "隶书", "隸書"],
  ["MingLiU", "细明体", "細明體"],
  ["MingLiU_HKSCS", "细明体香港字集", "細明體香港字集"],
  ["PMingLiU", "新细明体", "新細明體"],
  ["DFKai-SB", "标楷体", "標楷體"],
  ["BiauKai", "标楷体", "標楷體"],
  ["STKaiti", "华文楷体", "華文楷體"],
  ["STSong", "华文宋体", "華文宋體"],
  ["STXihei", "华文细黑", "華文細黑"],
  ["STZhongsong", "华文中宋", "華文中宋"],
  ["STFangsong", "华文仿宋", "華文仿宋"],
  ["STHupo", "华文琥珀", "華文琥珀"],
  ["STLiti", "华文隶书", "華文隸書"],
  ["STXingkai", "华文行楷", "華文行楷"],
  ["STXinwei", "华文新魏", "華文新魏"],
  ["STCaiyun", "华文彩云", "華文彩雲"],
  ["Source Han Sans TC", "思源黑体", "思源黑體"],
  ["Source Han Sans SC", "思源黑体", "思源黑體"],
  ["Source Han Serif TC", "思源宋体", "思源宋體"],
  ["Source Han Serif SC", "思源宋体", "思源宋體"],
  ["Noto Sans TC", "思源黑体", "思源黑體"],
  ["Noto Sans SC", "思源黑体", "思源黑體"],
  ["Noto Serif TC", "思源宋体", "思源宋體"],
  ["Noto Serif SC", "思源宋体", "思源宋體"],
  ["Noto Sans CJK TC", "思源黑体", "思源黑體"],
  ["Noto Serif CJK TC", "思源宋体", "思源宋體"],
  ["LXGW WenKai", "霞鹜文楷", "霞鶩文楷"],
  ["LXGW WenKai TC", "霞鹜文楷", "霞鶩文楷"],
  ["Sarasa Mono TC", "更纱等宽", "更紗等寬", "等宽", "等寬"],
  ["Sarasa Gothic TC", "更纱黑体", "更紗黑體"],
  ["PingFang TC", "苹方", "蘋方", "苹方-繁", "蘋方-繁"],
  ["PingFang SC", "苹方", "蘋方", "苹方-简", "蘋方-簡"],
  ["Songti TC", "宋体-繁", "宋體-繁"],
  ["Songti SC", "宋体-简", "宋體-簡"],
  ["Kaiti TC", "楷体-繁", "楷體-繁"],
  ["Kaiti SC", "楷体-简", "楷體-簡"],
  ["Yuanti TC", "圆体-繁", "圓體-繁"],
  ["Yuanti SC", "圆体-简", "圓體-簡"],
  ["Heiti TC", "黑体-繁", "黑體-繁"],
  ["Heiti SC", "黑体-简", "黑體-簡"],
  ["Hiragino Sans GB", "冬青黑体简体中文", "冬青黑體簡體中文"],
  ["Lantinghei TC", "兰亭黑", "蘭亭黑"],
  ["Lantinghei SC", "兰亭黑", "蘭亭黑"],
  ["Yu Gothic", "游ゴシック"],
  ["Yu Mincho", "游明朝"],
  ["Meiryo", "メイリオ"],
  ["MS Gothic", "MS ゴシック"],
  ["MS Mincho", "MS 明朝"],
  ["Hiragino Kaku Gothic ProN", "ヒラギノ角ゴシック"],
  ["Hiragino Mincho ProN", "ヒラギノ明朝"],
  ["Malgun Gothic", "맑은 고딕"],
  ["Apple SD Gothic Neo", "애플 SD 산돌고딕 Neo"],
  ["NanumGothic", "나눔고딕"],
];

const ALIAS_INDEX = new Map<string, string[]>();

for (const group of ALIAS_GROUPS) {
  const names = group.map((name) => normalizeSearchText(name));
  for (const name of names) {
    const merged = ALIAS_INDEX.get(name) || [];
    for (const other of names) {
      if (other !== name && merged.indexOf(other) < 0) merged.push(other);
    }
    ALIAS_INDEX.set(name, merged);
  }
}

export const fontAliases = (name: string): string[] => {
  const key = normalizeSearchText(name);
  const direct = ALIAS_INDEX.get(key);
  if (direct) return direct;
  const found: string[] = [];
  for (const [alias, names] of ALIAS_INDEX) {
    if (key.indexOf(alias) < 0) continue;
    for (const other of names) {
      if (found.indexOf(other) < 0) found.push(other);
    }
  }
  return found;
};

const unquote = (part: string): string => part.trim().replace(/^["']+|["']+$/g, "");

export const fontStackSearch = (stack: string): string => {
  const parts: string[] = [];
  for (const chunk of stack.split(",")) {
    const name = unquote(chunk);
    if (!name || GENERIC_STACK.has(name.toLowerCase())) continue;
    parts.push(name, ...fontAliases(name));
  }
  return parts.join(" ");
};

export const fontSearchText = (...parts: string[]): string =>
  normalizeSearchText(parts.filter(Boolean).join(" "));

export const fontTokens = (value: unknown): string[] =>
  normalizeSearchText(value).split(" ").filter(Boolean);

export const fontMatches = (text: string, tokens: string[]): boolean =>
  tokens.every((token) => text.indexOf(token) >= 0);
