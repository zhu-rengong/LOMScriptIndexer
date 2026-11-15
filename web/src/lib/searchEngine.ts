import MiniSearch from "minisearch";

export type SearchDoc = {
  key: string;
  text: string;
};

const SEGMENT = /[^\p{L}\p{N}]+/u;

export const searchTokens = (value: string): string[] => {
  const tokens = new Set<string>();
  for (const segment of String(value ?? "")
    .toLowerCase()
    .split(SEGMENT)) {
    for (let index = 0; index + 2 <= segment.length; index++) {
      tokens.add(segment.slice(index, index + 2));
    }
  }
  return Array.from(tokens);
};

export const createSearchEngine = (): MiniSearch<SearchDoc> =>
  new MiniSearch<SearchDoc>({
    idField: "key",
    fields: ["text"],
    tokenize: searchTokens,
    searchOptions: { combineWith: "AND" },
  });

export const searchCandidates = (
  engine: MiniSearch<SearchDoc>,
  needle: string,
): string[] | null => {
  if (!searchTokens(needle).length) return null;
  return engine.search(needle, { combineWith: "AND" }).map((hit) => String(hit.id));
};
