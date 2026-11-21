import { readDataset } from "../data/access";

export type PortraitCell = [number, number];

export type PortraitManifest = {
  version: number;
  size: [number, number];
  columns: number;
  pages: string[];
  characters: Record<string, Record<string, PortraitCell>>;
  moods: Record<string, PortraitCell>;
  moodMap: Record<string, string>;
};

export type PortraitPick = {
  file: string;
  column: number;
  row: number;
  columns: number;
  aspect: number;
  fallback: boolean;
};

export const pickPortrait = (character: string, expression: string): PortraitPick | null => {
  const data = usePortraitsStore(pinia).manifest;
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
  new URL(readDataset().assetUrl("portrait", { file }), document.baseURI).href;

export const pickMood = (expression: string): PortraitPick | null => {
  const data = usePortraitsStore(pinia).manifest;
  if (!data) return null;
  const key = data.moodMap[expression.toLowerCase()];
  const cell = key ? data.moods[key] : undefined;
  if (!cell) return null;
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
