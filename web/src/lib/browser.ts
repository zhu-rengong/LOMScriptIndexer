export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const toNeedle = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const BLANK_RUN = /\s+/g;
const ZERO_WIDTH = /[\u200b-\u200d\ufeff]/g;
const HAN_GAP = /(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu;

export const normalizeSearchText = (value: unknown): string =>
  String(value ?? "")
    .toLowerCase()
    .replace(BLANK_RUN, " ")
    .replace(ZERO_WIDTH, "")
    .replace(HAN_GAP, "")
    .trim();

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;

export const formatCount = (value: unknown): string =>
  String(Number(value) || 0).replace(THOUSANDS, ",");

export const signedNumber = (value: number): string => (value > 0 ? `+${value}` : String(value));

export const nearBottom = (node: HTMLElement, threshold: number): boolean =>
  node.scrollHeight - node.scrollTop - node.clientHeight < threshold;

export const byId = (id: string): HTMLElement | null => document.getElementById(id);
