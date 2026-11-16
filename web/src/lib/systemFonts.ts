export type FontSourceStatus = "idle" | "loading" | "ready" | "empty" | "unsupported";

let detected: string[] | null = null;
let pending: Promise<string[]> | null = null;

const statusRef = ref<FontSourceStatus>("idle");

export const familiesRef = ref<string[]>([]);

const supported = (): boolean => typeof window.queryLocalFonts === "function";

const orderFamilies = (names: string[]): string[] => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of names) {
    const clean = String(name || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(clean);
  }
  return list.sort((a, b) => a.localeCompare(b));
};

const enumerateFamilies = async (): Promise<string[]> => {
  const queryLocalFonts = window.queryLocalFonts;
  if (!queryLocalFonts) return [];
  try {
    const fonts = await queryLocalFonts();
    return orderFamilies(fonts.map((font) => font.family));
  } catch {
    return [];
  }
};

const ensureFamilies = (): Promise<string[]> => {
  if (detected) return Promise.resolve(detected);
  if (pending) return pending;
  if (!supported()) {
    statusRef.value = "unsupported";
    return Promise.resolve([]);
  }
  statusRef.value = "loading";
  pending = enumerateFamilies().then((list) => {
    familiesRef.value = list;
    statusRef.value = list.length ? "ready" : "empty";
    if (list.length) detected = list;
    pending = null;
    return list;
  });
  return pending;
};

export const fonts = {
  ensureFamilies,
  families: (): string[] => familiesRef.value,
  status: (): FontSourceStatus => statusRef.value,
};
