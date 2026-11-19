import { LOGIC_ALIAS, ROOTS } from "./fields";

export const isSpace = (ch: string): boolean =>
  ch === " " || ch === "\t" || ch === "\n" || ch === "\r";

export const logicWordAt = (rest: string): string => {
  for (const word of ROOTS) {
    if (new RegExp(`^${word}(?=[\\s(]|$)`, "i").test(rest)) return word;
  }
  for (const word of LOGIC_ALIAS.keys()) {
    if (word && rest.toLowerCase().indexOf(word) === 0) return word;
  }
  return "";
};

export const termStart = (source: string, cursor: number): number => {
  let start = 0;
  let quote: string | null = null;
  let index = 0;
  while (index < cursor) {
    const ch = source[index];
    if (quote) {
      if (ch === quote) quote = null;
      index++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      index++;
      continue;
    }
    if (ch === "(" || ch === ")") {
      start = index + 1;
      index++;
      continue;
    }
    const boundary = index === 0 || /[\s()]/.test(source[index - 1]);
    if (boundary) {
      const word = logicWordAt(source.slice(index, cursor));
      if (word) {
        start = index + word.length;
        index = start;
        continue;
      }
    }
    index++;
  }
  while (start < cursor && isSpace(source[start])) start++;
  return start;
};

export const findOperator = (segment: string): number => {
  let quote: string | null = null;
  for (let index = 0; index < segment.length; index++) {
    const ch = segment[index];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (":=><!".indexOf(ch) >= 0) return index;
  }
  return -1;
};
