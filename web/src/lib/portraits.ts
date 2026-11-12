import { shallowRef } from "vue";
import { dataset } from "../data/dataset";

export type PortraitManifest = {
  version: number;
  size: [number, number];
  characters: Record<string, Record<string, string>>;
};

export type PortraitPick = { file: string; fallback: boolean };

export const portraitManifest = shallowRef<PortraitManifest | null>(null);

let loading: Promise<void> | null = null;

const normalize = (data: unknown): PortraitManifest | null => {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const characters = record.characters;
  if (!characters || typeof characters !== "object" || Array.isArray(characters)) return null;
  const size = Array.isArray(record.size) ? record.size : [];
  return {
    version: typeof record.version === "number" ? record.version : 0,
    size: [Number(size[0]) || 0, Number(size[1]) || 0],
    characters: characters as Record<string, Record<string, string>>,
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
  const table = portraitManifest.value?.characters[character];
  if (!table) return null;
  const exact = expression ? table[expression] : "";
  if (exact) return { file: exact, fallback: false };
  return table.normal ? { file: table.normal, fallback: true } : null;
};

export const portraitUrl = (file: string): string => dataset.assetUrl("portrait", { file });
