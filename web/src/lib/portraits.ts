import { shallowRef } from "vue";
import { dataset } from "../data/dataset";

export type PortraitCell = [number, number];

export type PortraitManifest = {
  version: number;
  size: [number, number];
  columns: number;
  pages: string[];
  characters: Record<string, Record<string, PortraitCell>>;
};

export type PortraitPick = {
  file: string;
  column: number;
  row: number;
  columns: number;
  aspect: number;
  fallback: boolean;
};

const VERSION = 6;

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
    const expressions: Record<string, PortraitCell> = {};
    for (const [expression, cell] of Object.entries(value as Record<string, unknown>)) {
      if (!Array.isArray(cell) || cell.length !== 2) continue;
      const page = asIndex(cell[0], pages.length);
      const index = asIndex(cell[1], Number.MAX_SAFE_INTEGER);
      if (page === null || index === null) continue;
      expressions[expression] = [page, index];
    }
    if (Object.keys(expressions).length) characters[character] = expressions;
  }
  return {
    version: VERSION,
    size: [width, height],
    columns,
    pages: pages as string[],
    characters,
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

export const portraitUrl = (file: string): string => dataset.assetUrl("portrait", { file });
