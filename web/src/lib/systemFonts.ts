export type FontSourceStatus =
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

const ENUMERATION_TIMEOUT = 10000;

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
  const fonts = await queryLocalFonts();
  return orderFamilies(fonts.map((font) => font.family));
};

const failureStatus = (error: unknown): FontSourceStatus => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "denied";
  if (name === "SecurityError") return "blocked";
  if (name === "NotSupportedError") return "unsupported";
  return "empty";
};

const ensureFamilies = (): Promise<string[]> => {
  if (detected) return Promise.resolve(detected);
  if (pending) return pending;
  if (window.location.protocol === "file:") {
    statusRef.value = "file";
    return Promise.resolve([]);
  }
  if (!supported()) {
    statusRef.value = "unsupported";
    return Promise.resolve([]);
  }
  if (!window.isSecureContext) {
    statusRef.value = "insecure";
    return Promise.resolve([]);
  }
  statusRef.value = "loading";
  let settled = false;
  const timer = window.setTimeout(() => {
    if (settled) return;
    statusRef.value = "timeout";
    console.warn("[ScriptIndexer] local font enumeration timed out");
  }, ENUMERATION_TIMEOUT);
  pending = enumerateFamilies()
    .then((list) => {
      familiesRef.value = list;
      statusRef.value = list.length ? "ready" : "empty";
      if (list.length) detected = list;
      return list;
    })
    .catch((error: unknown) => {
      console.warn("[ScriptIndexer] local font enumeration failed", error);
      familiesRef.value = [];
      statusRef.value = failureStatus(error);
      return [];
    })
    .finally(() => {
      settled = true;
      window.clearTimeout(timer);
      pending = null;
    });
  return pending;
};

export const fonts = {
  ensureFamilies,
  families: (): string[] => familiesRef.value,
  status: (): FontSourceStatus => statusRef.value,
};
