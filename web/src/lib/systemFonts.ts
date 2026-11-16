type FontSourceStatus =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "unsupported"
  | "insecure"
  | "denied"
  | "blocked"
  | "file"
  | "timeout";

export type SystemFont = {
  family: string;
  label: string;
  aliases: string[];
};

type LocalFontsQuery = NonNullable<Window["queryLocalFonts"]>;

const ENUMERATION_TIMEOUT = 10000;

const hasNonAscii = (value: string): boolean => {
  for (const char of value) if ((char.codePointAt(0) || 0) > 0x7f) return true;
  return false;
};

let detected: SystemFont[] | null = null;
let pending: Promise<SystemFont[]> | null = null;

export const systemFonts = ref<SystemFont[]>([]);
export const systemFontStatus = ref<FontSourceStatus>("idle");

export const systemFamilyNames = computed<Set<string>>(
  () => new Set(systemFonts.value.map((font) => font.family)),
);

const displayNames = computed<Map<string, string>>(
  () => new Map(systemFonts.value.map((font) => [font.family, font.label])),
);

export const fontDisplayName = (value: string): string => displayNames.value.get(value) || value;

const clean = (value: string | undefined): string => String(value || "").trim();

const pushUnique = (list: string[], value: string): void => {
  if (!value) return;
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) return;
  list.push(value);
};

const shortest = (list: string[]): string =>
  list.reduce((best, name) => (name.length < best.length ? name : best));

const pickLabel = (family: string, fullNames: string[]): string => {
  const pool: string[] = [family];
  fullNames.forEach((name) => pushUnique(pool, name));
  const localized = pool.filter(hasNonAscii);
  return shortest(localized.length ? localized : pool);
};

const groupFonts = (faces: LocalFontData[]): SystemFont[] => {
  const groups = new Map<string, { family: string; fullNames: string[]; aliases: string[] }>();
  for (const face of faces) {
    const family = clean(face.family);
    if (!family) continue;
    const key = family.toLowerCase();
    let entry = groups.get(key);
    if (!entry) {
      entry = { family, fullNames: [], aliases: [] };
      groups.set(key, entry);
    }
    pushUnique(entry.fullNames, clean(face.fullName));
    pushUnique(entry.aliases, clean(face.fullName));
    pushUnique(entry.aliases, clean(face.postscriptName));
  }
  const list: SystemFont[] = [];
  for (const entry of groups.values()) {
    const aliases = entry.aliases.filter(
      (name) => name.toLowerCase() !== entry.family.toLowerCase(),
    );
    list.push({ family: entry.family, label: pickLabel(entry.family, entry.fullNames), aliases });
  }
  return list.sort((a, b) => a.label.localeCompare(b.label) || a.family.localeCompare(b.family));
};

const localFontsQuery = (): LocalFontsQuery | null =>
  typeof window.queryLocalFonts === "function" ? window.queryLocalFonts : null;

const enumerateFonts = async (query: LocalFontsQuery): Promise<SystemFont[]> => {
  const list = await query();
  return groupFonts(list);
};

const failureStatus = (error: unknown): FontSourceStatus => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "denied";
  if (name === "SecurityError") return "blocked";
  if (name === "NotSupportedError") return "unsupported";
  return "empty";
};

const permissionState = async (): Promise<PermissionState | null> => {
  try {
    const status = await navigator.permissions.query({
      name: "local-fonts" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
};

export const ensureSystemFonts = (): Promise<SystemFont[]> => {
  if (detected) return Promise.resolve(detected);
  if (pending) return pending;
  if (window.location.protocol === "file:") {
    systemFontStatus.value = "file";
    return Promise.resolve([]);
  }
  const query = localFontsQuery();
  if (!query) {
    systemFontStatus.value = "unsupported";
    return Promise.resolve([]);
  }
  if (!window.isSecureContext) {
    systemFontStatus.value = "insecure";
    return Promise.resolve([]);
  }
  systemFontStatus.value = "loading";
  let settled = false;
  const timer = window.setTimeout(() => {
    if (settled) return;
    systemFontStatus.value = "timeout";
    console.warn("[ScriptIndexer] local font enumeration timed out");
  }, ENUMERATION_TIMEOUT);
  pending = enumerateFonts(query)
    .then(async (list) => {
      systemFonts.value = list;
      if (list.length) {
        systemFontStatus.value = "ready";
        detected = list;
        return list;
      }
      const state = await permissionState();
      systemFontStatus.value = state === "denied" ? "denied" : "empty";
      return list;
    })
    .catch((error: unknown) => {
      console.warn("[ScriptIndexer] local font enumeration failed", error);
      systemFonts.value = [];
      systemFontStatus.value = failureStatus(error);
      return [];
    })
    .finally(() => {
      settled = true;
      window.clearTimeout(timer);
      pending = null;
    });
  return pending;
};
