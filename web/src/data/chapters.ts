import type { Chapter } from "../types/graph";

export const DEFAULT_CHAPTER_COLOR = "#8A8578";

export const EMPTY_CHAPTER: Chapter = {
  id: "",
  kind: "other",
  number: null,
  color: DEFAULT_CHAPTER_COLOR,
  scriptCount: 0,
};
