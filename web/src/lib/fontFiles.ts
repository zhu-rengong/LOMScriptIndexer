const DB_NAME = "legend-of-mortal.scriptindexer.fonts";
const STORE = "files";

type FontFileRecord = { family: string; data: Blob };

const namesRef = ref<string[]>([]);
const faces = new Map<string, FontFace>();

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "family" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readAll = async (): Promise<FontFileRecord[]> => {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as FontFileRecord[]);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
};

const write = async (record: FontFileRecord): Promise<void> => {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return;
  }
};

const register = async (family: string, data: Blob): Promise<boolean> => {
  try {
    const face = new FontFace(family, await data.arrayBuffer());
    await face.load();
    const previous = faces.get(family);
    if (previous) document.fonts.delete(previous);
    document.fonts.add(face);
    faces.set(family, face);
    return true;
  } catch {
    return false;
  }
};

const familyOf = (file: File): string => {
  const stem = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const base = stem || "Local font";
  return /^[\p{L}_]/u.test(base) ? base : `Font ${base}`;
};

const load = async (): Promise<void> => {
  const records = await readAll();
  const names: string[] = [];
  for (const record of records) {
    if (await register(record.family, record.data)) names.push(record.family);
  }
  namesRef.value = names;
};

const importFile = async (file: File): Promise<string | null> => {
  const family = familyOf(file);
  if (!(await register(family, file))) return null;
  await write({ family, data: file });
  if (namesRef.value.indexOf(family) < 0) namesRef.value = namesRef.value.concat(family);
  return family;
};

export const fontFiles = {
  names: (): string[] => namesRef.value,
  load,
  import: importFile,
};
