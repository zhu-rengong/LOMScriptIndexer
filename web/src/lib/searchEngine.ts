import MiniSearch from "minisearch";

export type SearchDoc = {
  key: string;
  text: string;
};

const SEGMENT = /[^\p{L}\p{N}]+/u;

const HAN = /^[\u3400-\u9fff\uf900-\ufaff]+$/;

export const searchTokens = (value: string): string[] => {
  const tokens = new Set<string>();
  for (const segment of String(value ?? "")
    .toLowerCase()
    .split(SEGMENT)) {
    if (HAN.test(segment)) {
      for (const char of segment) tokens.add(char);
      continue;
    }
    for (let index = 0; index < segment.length; index++) {
      tokens.add(segment[index]);
      const pair = segment.slice(index, index + 2);
      if (pair.length === 2) tokens.add(pair);
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
