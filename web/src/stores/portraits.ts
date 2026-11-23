import type { PortraitCell, PortraitManifest } from "../lib/portraits";
import { readDataset } from "../data/access";

const VERSION = 9;

const isFileName = (value: unknown): value is string =>
  typeof value === "string" &&
  !!value &&
  !value.includes("/") &&
  !value.includes("\\") &&
  !value.includes("..");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const asIndex = (value: unknown, limit: number): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return null;
  return value < limit ? value : null;
};

const readMoodMap = (value: unknown): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!isRecord(value)) return map;
  for (const [key, mood] of Object.entries(value)) {
    if (typeof mood === "string" && mood) map[key] = mood;
  }
  return map;
};

const readCells = (value: unknown, pageCount: number): Record<string, PortraitCell> => {
  const cells: Record<string, PortraitCell> = {};
  if (!isRecord(value)) return cells;
  for (const [key, cell] of Object.entries(value)) {
    if (!Array.isArray(cell) || cell.length !== 2) continue;
    const page = asIndex(cell[0], pageCount);
    const index = asIndex(cell[1], Number.MAX_SAFE_INTEGER);
    if (page === null || index === null) continue;
    cells[key] = [page, index];
  }
  return cells;
};

const normalize = (data: unknown): PortraitManifest | null => {
  if (!isRecord(data)) return null;
  if (data.version !== VERSION) return null;
  const rawPages = data.pages;
  if (!Array.isArray(rawPages) || !rawPages.length) return null;
  const pages = rawPages.filter(isFileName);
  if (pages.length !== rawPages.length) return null;
  const columns = asIndex(data.columns, Number.MAX_SAFE_INTEGER);
  if (!columns) return null;
  const size = Array.isArray(data.size) ? data.size : [];
  const width = Number(size[0]) || 0;
  const height = Number(size[1]) || 0;
  if (!width || !height) return null;
  const rawCharacters = data.characters;
  if (!isRecord(rawCharacters)) return null;
  const characters: Record<string, Record<string, PortraitCell>> = {};
  for (const [character, value] of Object.entries(rawCharacters)) {
    if (!isRecord(value)) continue;
    const expressions = readCells(value, pages.length);
    if (Object.keys(expressions).length) characters[character] = expressions;
  }
  return {
    version: VERSION,
    size: [width, height],
    columns,
    pages,
    characters,
    moods: readCells(data.moods, pages.length),
    moodMap: readMoodMap(data.moodMap),
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
