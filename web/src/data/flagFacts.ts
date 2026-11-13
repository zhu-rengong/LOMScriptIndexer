import { dataset } from "./dataset";

export type FlagFactTable = {
  values: string[];
  negated: string[];
};

const tables = (): Record<string, FlagFactTable> => {
  const out: Record<string, FlagFactTable> = {};
  for (const [flag, table] of Object.entries(dataset.flagFacts.flags ?? {})) {
    out[flag] = { values: table.values ?? [], negated: table.negated ?? [] };
  }
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

export const flagFactKey = (flag: string, value: string, negated: boolean): string => {
  const table = tables()[flag];
  if (!table) return "";
  const bucket = negated ? table.negated : table.values;
  if (bucket.indexOf(value) < 0) return "";
  return `fact.${flag}.${negated ? "not." : ""}${value}`;
};

export const flagMeasureKey = (flag: string): string => (flag ? `measure.${flag}` : "");
