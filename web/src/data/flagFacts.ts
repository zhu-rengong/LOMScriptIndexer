import { dataset } from "./dataset";

export type FlagFactTable = {
  values: string[];
  negated: string[];
};

let cached: Record<string, FlagFactTable> | null = null;

const tables = (): Record<string, FlagFactTable> => {
  if (cached) return cached;
  const out: Record<string, FlagFactTable> = {};
  for (const [flag, table] of Object.entries(dataset.flagFacts.flags ?? {})) {
    out[flag] = { values: table.values ?? [], negated: table.negated ?? [] };
  }
  cached = out;
  return out;
};

export const flagFacts: Record<string, FlagFactTable> = new Proxy(
  {},
  {
    get: (_target, key: string) => tables()[key],
    ownKeys: () => Reflect.ownKeys(tables()),
    getOwnPropertyDescriptor: (_target, key: string) => {
      const table = tables()[key];
      return table ? { enumerable: true, configurable: true, value: table } : undefined;
    },
  },
) as Record<string, FlagFactTable>;

export const isBinaryValues = (values: readonly string[]): boolean =>
  values.length > 0 &&
  values.indexOf("1") >= 0 &&
  values.every((value) => value === "0" || value === "1");

export const isBinaryFlag = (flag: string): boolean => isBinaryValues(tables()[flag]?.values || []);

export const flagFactKey = (flag: string, value: string, negated: boolean): string => {
  const table = tables()[flag];
  if (!table) return "";
  const bucket = negated ? table.negated : table.values;
  if (bucket.indexOf(value) < 0) return "";
  return `fact.${flag}.${negated ? "not." : ""}${value}`;
};

export const flagMeasureKey = (flag: string): string => (flag ? `measure.${flag}` : "");
