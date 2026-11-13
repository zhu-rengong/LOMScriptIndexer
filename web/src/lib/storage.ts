const NAMESPACE = "legend-of-mortal.scriptindexer";

export const keys = {
  lang: `${NAMESPACE}.lang.v1`,
  prefs: `${NAMESPACE}.prefs`,
  bookmarks: `${NAMESPACE}.bookmarks.v1`,
  infer: `${NAMESPACE}.infer.v1`,
  condInfer: `${NAMESPACE}.condInfer.v1`,
};

export const readRaw = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const writeRaw = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const readJson = <T>(key: string): T | null => {
  const raw = readRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const writeJson = (key: string, value: unknown): boolean => {
  let payload = "";
  try {
    payload = JSON.stringify(value);
  } catch {
    return false;
  }
  return writeRaw(key, payload);
};
