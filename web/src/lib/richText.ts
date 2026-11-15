import type { RichTextSegment } from "../types/beats";
import { clamp } from "./browser";

const SIZE_BASE = 40;
const SIZE_MIN_SCALE = 0.72;
const SIZE_MAX_SCALE = 1.9;
const MARKUP_TAG = /\{([^{}]*)\}/g;
const MARKUP_TAG_ALL = /\{[^{}]*\}/g;

export const stripMarkup = (value: unknown): string =>
  value ? String(value).replace(MARKUP_TAG_ALL, "") : "";

export const paragraphLines = (value: unknown): string[] =>
  stripMarkup(value)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

const clampScale = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, SIZE_MIN_SCALE, SIZE_MAX_SCALE);
};

export const parseRichText = (value: string): RichTextSegment[] => {
  const source = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+/g, " ");
  if (!source) return [];
  const out: RichTextSegment[] = [];
  const stack: number[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  MARKUP_TAG.lastIndex = 0;
  const push = (chunk: string) => {
    if (!chunk) return;
    const scale = stack.length ? stack[stack.length - 1] : 1;
    out.push({ text: chunk, scale });
  };
  while ((match = MARKUP_TAG.exec(source)) !== null) {
    if (match.index > last) push(source.slice(last, match.index));
    const tag = (match[1] || "").trim();
    const tagLower = tag.toLowerCase();
    if (tagLower.indexOf("/size") === 0 || tagLower === "size") {
      stack.pop();
    } else if (tagLower.indexOf("size") === 0 && tag.indexOf("=") > 0) {
      const sizeValue = parseFloat(tag.slice(tag.indexOf("=") + 1));
      stack.push(
        Number.isFinite(sizeValue)
          ? clampScale(sizeValue / SIZE_BASE)
          : stack[stack.length - 1] || 1,
      );
    }
    last = MARKUP_TAG.lastIndex;
  }
  if (last < source.length) push(source.slice(last));
  return out;
};
