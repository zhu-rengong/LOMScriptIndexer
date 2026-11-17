import { shallowRef } from "vue";
import { dataset } from "../data/dataset";

export type PortraitCell = [number, number];

export type PortraitManifest = {
  version: number;
  size: [number, number];
  columns: number;
  pages: string[];
  characters: Record<string, Record<string, PortraitCell>>;
  moods: Record<string, PortraitCell>;
};

export type PortraitPick = {
  file: string;
  column: number;
  row: number;
  columns: number;
  aspect: number;
  fallback: boolean;
};

const VERSION = 8;

export const portraitManifest = shallowRef<PortraitManifest | null>(null);

let loading: Promise<void> | null = null;

const isFileName = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value &&
  !value.includes("/") &&
  !value.includes("\\") &&
  !value.includes("..");

const asIndex = (value: unknown, limit: number): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value < limit ? value : null;
};

const readCells = (value: unknown, pageCount: number): Record<string, PortraitCell> => {
  const cells: Record<string, PortraitCell> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return cells;
  for (const [key, cell] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(cell) || cell.length !== 2) continue;
    const page = asIndex(cell[0], pageCount);
    const index = asIndex(cell[1], Number.MAX_SAFE_INTEGER);
    if (page === null || index === null) continue;
    cells[key] = [page, index];
  }
  return cells;
};

const normalize = (data: unknown): PortraitManifest | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.version !== VERSION) return null;
  const pages = record.pages;
  if (!Array.isArray(pages) || !pages.length || !pages.every(isFileName)) return null;
  const columns = asIndex(record.columns, Number.MAX_SAFE_INTEGER);
  if (!columns) return null;
  const size = Array.isArray(record.size) ? record.size : [];
  const width = Number(size[0]) || 0;
  const height = Number(size[1]) || 0;
  if (!width || !height) return null;
  const rawCharacters = record.characters;
  if (!rawCharacters || typeof rawCharacters !== "object" || Array.isArray(rawCharacters)) {
    return null;
  }
  const characters: Record<string, Record<string, PortraitCell>> = {};
  for (const [character, value] of Object.entries(rawCharacters)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const expressions = readCells(value, pages.length);
    if (Object.keys(expressions).length) characters[character] = expressions;
  }
  return {
    version: VERSION,
    size: [width, height],
    columns,
    pages: pages as string[],
    characters,
    moods: readCells(record.moods, pages.length),
  };
};

export const ensurePortraitManifest = (): Promise<void> => {
  if (!loading) {
    loading = fetch(dataset.assetUrl("portraitManifest"))
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const manifest = normalize(data);
        if (manifest) portraitManifest.value = manifest;
      })
      .catch(() => undefined);
  }
  return loading;
};

export const pickPortrait = (character: string, expression: string): PortraitPick | null => {
  const data = portraitManifest.value;
  const table = data?.characters[character];
  if (!data || !table) return null;
  let cell = expression ? table[expression] : undefined;
  let fallback = false;
  if (!cell) {
    cell = table.normal;
    fallback = true;
  }
  if (!cell) return null;
  const file = data.pages[cell[0]];
  if (!file) return null;
  return {
    file,
    column: cell[1] % data.columns,
    row: Math.floor(cell[1] / data.columns),
    columns: data.columns,
    aspect: data.size[1] / data.size[0],
    fallback,
  };
};

export const portraitUrl = (file: string): string =>
  new URL(dataset.assetUrl("portrait", { file }), document.baseURI).href;

const MOOD_BASES = ["laugh", "nervous", "angry", "shy", "shock", "silent"];

export const moodOf = (expression: string): string => {
  const value = expression.toLowerCase();
  const base = MOOD_BASES.find((item) => value.startsWith(item));
  if (!base) return "";
  if (base === "laugh") return "happy";
  if (base === "nervous") return /^nervous\d+$/.test(value) ? value : "nervous1";
  return base;
};

export const pickMood = (key: string): PortraitPick | null => {
  const data = portraitManifest.value;
  const cell = key ? data?.moods[key] : undefined;
  if (!data || !cell) return null;
  const file = data.pages[cell[0]];
  if (!file) return null;
  return {
    file,
    column: cell[1] % data.columns,
    row: Math.floor(cell[1] / data.columns),
    columns: data.columns,
    aspect: data.size[1] / data.size[0],
    fallback: false,
  };
};
