import { languageMeta } from "../i18n/meta";
import type { OpenccConfig } from "../i18n/types";
import type { BeatRow } from "../types/beats";

type Converter = (text: string) => string;

type OpenccRuntime = {
  Converter: (options: { from: string; to: string }) => Converter;
  CustomConverter: (variants: string) => Converter;
};

const converters = new Map<string, Converter>();

let runtime: Promise<OpenccRuntime> | null = null;

const configOf = (lang: string): OpenccConfig | null => {
  const entry = languageMeta[lang];
  return entry && entry.opencc ? entry.opencc : null;
};

const loadRuntime = (): Promise<OpenccRuntime> => {
  if (runtime) return runtime;
  runtime = import("opencc-js/t2cn")
    .then((module) => ({
      Converter: module.Converter,
      CustomConverter: module.CustomConverter,
    }))
    .catch((error: unknown) => {
      runtime = null;
      throw error;
    });
  return runtime;
};

const buildConverter = (module: OpenccRuntime, config: OpenccConfig): Converter => {
  const base = module.Converter({ from: config.from, to: config.to });
  const variants = config.variants ? module.CustomConverter(config.variants) : null;
  return variants ? (text: string) => variants(base(text)) : base;
};

const ensureConverter = (lang: string): Promise<boolean> => {
  if (converters.get(lang)) return Promise.resolve(true);
  const config = configOf(lang);
  if (!config) {
    converters.set(lang, (text: string) => text);
    return Promise.resolve(true);
  }
  return loadRuntime().then(
    (module) => {
      converters.set(lang, buildConverter(module, config));
      return true;
    },
    () => false,
  );
};

const hasConverter = (lang: string): boolean => !!converters.get(lang);

const convertText = (lang: string, value: string): string => {
  const converter = converters.get(lang);
  if (!converter || !value) return value;
  return converter(value);
};

const convertDeepValue = (lang: string, value: unknown): unknown => {
  if (typeof value === "string") return convertText(lang, value);
  if (Array.isArray(value)) return value.map((item) => convertDeepValue(lang, item));
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source)) out[key] = convertDeepValue(lang, source[key]);
  return out;
};

const convertRows = (lang: string, beats: BeatRow[] | null): BeatRow[] | null => {
  if (!converters.get(lang) || !Array.isArray(beats)) return beats;
  return convertDeepValue(lang, beats) as BeatRow[];
};

const convertDeep = <T>(lang: string, value: T): T => {
  if (!converters.get(lang) || !value || typeof value !== "object") return value;
  return convertDeepValue(lang, value) as T;
};

export const convert = {
  beatRows: convertRows,
  ensureConverter,
  hasConverter,
  text: convertText,
  tree: convertDeep,
};
