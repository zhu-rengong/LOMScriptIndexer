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

type LocalFontsQuery = NonNullable<Window["queryLocalFonts"]>;

const ENUMERATION_TIMEOUT = 10000;

let detected: string[] | null = null;
let pending: Promise<string[]> | null = null;

export const systemFamilies = ref<string[]>([]);
export const systemFontStatus = ref<FontSourceStatus>("idle");

const localFontsQuery = (): LocalFontsQuery | null =>
  typeof window.queryLocalFonts === "function" ? window.queryLocalFonts : null;

const orderFamilies = (names: string[]): string[] => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const name of names) {
    const clean = name.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(clean);
  }
  return list.sort((a, b) => a.localeCompare(b));
};

const enumerateFamilies = async (query: LocalFontsQuery): Promise<string[]> => {
  const list = await query();
  return orderFamilies(list.map((font) => font.family));
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

export const ensureSystemFonts = (): Promise<string[]> => {
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
  pending = enumerateFamilies(query)
    .then(async (list) => {
      systemFamilies.value = list;
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
      systemFamilies.value = [];
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
