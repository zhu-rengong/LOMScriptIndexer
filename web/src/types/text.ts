import type { BeatNode } from "./beats";

export type NameTable = Record<string, Record<string, string>>;

export const ZH_INDEX = 0;
export const EN_INDEX = 1;

export type WordCount = [number, number];

export type WordRow = (WordCount | null)[];

export type WordPack = {
  scripts: Record<string, WordRow>;
  chapters: Record<string, WordRow>;
};

export type WordCountPack = {
  kinds?: string[];
  langs?: Record<string, WordPack>;
};

export type TextPack = {
  schema?: string;
  lang?: string;
  missingKeyCount?: number;
  missingKeys?: string[];
  shardKeys?: string[];
  characters: Record<string, string>;
  titles: Record<string, string>;
  names: NameTable;
  edgeLabels: Record<string, string>;
  scripts: Record<string, BeatNode[]>;
};

export type TextProgress = {
  headState: string;
  loaded: number;
  total: number;
  done: boolean;
  headError: string;
  shardError: string;
};

export type ShardState = "idle" | "loading" | "ready" | "failed" | "missing";
