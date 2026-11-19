import { t, timeDateText } from "../../i18n";

const TIME_KEY_LABELS: Record<string, string> = { PlayerGameTime: "timeNow" };

const CN_DIGITS: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

const CN_DIGIT_CHARS = "〇零一二三四五六七八九十";

const TIME_KEY_DATE = new RegExp(
  `^第([${CN_DIGIT_CHARS}]+)年([${CN_DIGIT_CHARS}]+)月([上中下])旬$`,
);

const TIME_STAGES: Record<string, number> = { 上: 1, 中: 2, 下: 3 };

export const cnNumber = (text: string): number => {
  if (text.indexOf("十") < 0) return CN_DIGITS[text] ?? 0;
  const [tens, ones] = text.split("十");
  return (tens ? (CN_DIGITS[tens] ?? 0) : 1) * 10 + (ones ? (CN_DIGITS[ones] ?? 0) : 0);
};

const dateKeyText = (key: string): string => {
  const match = TIME_KEY_DATE.exec(key);
  if (!match) return "";
  const year = cnNumber(match[1]);
  const month = cnNumber(match[2]);
  const period = TIME_STAGES[match[3]];
  if (!year || !month || !period) return "";
  return timeDateText(year, month, period);
};

export const timeNameOf = (key: string): string => {
  if (!key) return "";
  const label = TIME_KEY_LABELS[key];
  return label ? t(label) : dateKeyText(key) || key;
};
