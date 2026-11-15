import { useStorage } from "@vueuse/core";
import type { RemovableRef, Serializer } from "@vueuse/core";

const NAMESPACE = "legend-of-mortal.scriptindexer";

export const keys = {
  lang: `${NAMESPACE}.lang.v1`,
  prefs: `${NAMESPACE}.prefs`,
  bookmarks: `${NAMESPACE}.bookmarks.v1`,
  infer: `${NAMESPACE}.infer.v1`,
  condInfer: `${NAMESPACE}.condInfer.v1`,
};

export type StoredOptions<T> = {
  decode: (raw: unknown, base: T) => T;
  encode?: (value: T) => string;
};

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export const storedRef = <T extends string | number | boolean | object | null>(
  key: string,
  defaults: T,
  options: StoredOptions<T>,
): RemovableRef<T> => {
  const serializer: Serializer<T> = {
    read: (raw) => {
      try {
        return options.decode(parse(raw), defaults);
      } catch {
        return defaults;
      }
    },
    write: (value) => (options.encode ? options.encode(value) : JSON.stringify(value)),
  };
  return useStorage<T>(key, defaults, undefined, {
    writeDefaults: false,
    mergeDefaults: false,
    listenToStorageChanges: true,
    serializer,
    onError: () => {},
  });
};
