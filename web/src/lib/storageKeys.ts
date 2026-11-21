const NAMESPACE = "legend-of-mortal.scriptindexer";

export const STORAGE_KEYS = {
  lang: `${NAMESPACE}.lang.v1`,
  prefs: `${NAMESPACE}.prefs`,
  bookmarks: `${NAMESPACE}.bookmarks.v1`,
  infer: `${NAMESPACE}.infer.v1`,
} as const;
