import type { PortraitCell, PortraitManifest } from "../lib/portraits";
import { readDataset } from "../data/access";

const VERSION = 9;

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

const readMoodMap = (value: unknown): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return map;
  for (const [key, mood] of Object.entries(value as Record<string, unknown>)) {
    if (typeof mood === "string" && mood) map[key] = mood;
  }
  return map;
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
    moodMap: readMoodMap(record.moodMap),
  };
};

export const usePortraitsStore = defineStore("portraits", () => {
  const manifest = shallowRef<PortraitManifest | null>(null);
  let loading: Promise<void> | null = null;

  const ensure = (): Promise<void> => {
    if (!loading) {
      const url = `${readDataset().assetUrl("portraitManifest")}?v=${VERSION}`;
      loading = fetch(url, { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          const next = normalize(data);
          if (next) {
            manifest.value = next;
            return;
          }
          const found = (data as { version?: unknown } | null)?.version;
          console.warn(
            `[ScriptIndexer] portrait manifest v${String(found)} ignored, expected v${VERSION}`,
          );
        })
        .catch((error: unknown) => {
          console.warn("[ScriptIndexer] portrait manifest failed", error);
        });
    }
    return loading;
  };

  return { manifest, ensure };
});
