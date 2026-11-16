let detected: string[] | null = null;
let pending: Promise<string[]> | null = null;

export const familiesRef = ref<string[]>([]);

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
  if (typeof window.queryLocalFonts !== "function") return [];
  try {
    const fonts = await window.queryLocalFonts();
    return orderFamilies(fonts.map((font) => font.family));
  } catch {
    return [];
  }
};

const ensureFamilies = (): Promise<string[]> => {
  if (detected) return Promise.resolve(detected);
  if (pending) return pending;
  pending = enumerateFamilies().then((list) => {
    detected = list;
    familiesRef.value = list;
    pending = null;
    return list;
  });
  return pending;
};

export const fonts = {
  ensureFamilies,
  families: (): string[] => familiesRef.value,
};
