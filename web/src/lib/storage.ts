import { useStorage } from "@vueuse/core";
import type { RemovableRef, Serializer } from "@vueuse/core";
import { STORAGE_KEYS } from "./storageKeys";

export const keys = STORAGE_KEYS;

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
