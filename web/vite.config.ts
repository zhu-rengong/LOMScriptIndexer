import {
  createReadStream,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type { ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const docs = resolve(root, "..", "docs");
const previews = resolve(root, "..", "data", "cache", "portrait-previews");
const settingsFile = resolve(root, "..", "data", "portrait-framing.json");

const PREVIEW_FILE = /^[0-9a-f]{24}\.webp$/;
const FRAME_LIMIT = 2 * 1024 * 1024;
const MIN_WIDTH = 0.01;
const DIGITS = 5;

type Frame = { x: number; y: number; w: number };
type Settings = { version: 1; frames: Record<string, Record<string, Frame>> };

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Number(value.toFixed(DIGITS));

const normalizeFrame = (value: unknown): Frame | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  const x = frame.x;
  const y = frame.y;
  const w = frame.w;
  if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) return null;
  const width = round(clamp(w, MIN_WIDTH, 1));
  return { x: round(clamp(x, 0, 1 - width)), y: round(clamp(y, 0, 1)), w: width };
};

const normalizeSettings = (value: unknown): Settings => {
  const frames: Record<string, Record<string, Frame>> = {};
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const raw = (record as Record<string, unknown>).frames;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 1, frames };
  for (const character of Object.keys(raw).sort()) {
    const table = (raw as Record<string, unknown>)[character];
    if (!table || typeof table !== "object" || Array.isArray(table)) continue;
    const entries: Record<string, Frame> = {};
    for (const expression of Object.keys(table).sort()) {
      const frame = normalizeFrame((table as Record<string, unknown>)[expression]);
      if (frame) entries[expression] = frame;
    }
    if (Object.keys(entries).length) frames[character] = entries;
  }
  return { version: 1, frames };
};

type LoadedSettings = { settings: Settings; warning: string };

const readSettings = (): LoadedSettings => {
  if (!existsSync(settingsFile)) {
    return { settings: { version: 1, frames: {} }, warning: "settings file missing" };
  }
  try {
    const text = readFileSync(settingsFile, "utf8");
    return { settings: normalizeSettings(JSON.parse(text)), warning: "" };
  } catch {
    return { settings: { version: 1, frames: {} }, warning: "settings file is not valid JSON" };
  }
};

const writeSettings = (settings: Settings): void => {
  const text = `${JSON.stringify(settings, null, 2)}\n`;
  const temp = `${settingsFile}.${process.pid}.tmp`;
  writeFileSync(temp, text, "utf8");
  renameSync(temp, settingsFile);
};

const readBody = (req: Connect.IncomingMessage): Promise<string> =>
  new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > FRAME_LIMIT) {
        fail(new Error("settings payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
};

const framingData = (): Plugin => ({
  name: "scriptindexer-framing-data",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || "").split("?")[0];
      if (!url.startsWith("/framing-data/")) {
        next();
        return;
      }
      const route = url.slice("/framing-data/".length);

      if (route === "index.json") {
        const file = join(previews, "index.json");
        if (!existsSync(file)) {
          sendJson(res, 404, { error: "preview index not found; run scriptindexer-extract" });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(readFileSync(file));
        return;
      }

      if (route.startsWith("art/")) {
        const name = decodeURIComponent(route.slice("art/".length));
        if (!PREVIEW_FILE.test(name)) {
          sendJson(res, 400, { error: "invalid preview file name" });
          return;
        }
        const file = join(previews, name);
        if (!existsSync(file) || !statSync(file).isFile()) {
          sendJson(res, 404, { error: "preview file not found" });
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Cache-Control", "max-age=600");
        createReadStream(file).pipe(res);
        return;
      }

      if (route === "settings") {
        if (req.method === "POST") {
          readBody(req)
            .then((text) => {
              const settings = normalizeSettings(JSON.parse(text));
              writeSettings(settings);
              sendJson(res, 200, { saved: true, settings });
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : "invalid settings";
              sendJson(res, 400, { error: message });
            });
          return;
        }
        const loaded = readSettings();
        sendJson(res, 200, { ...loaded.settings, warning: loaded.warning });
        return;
      }

      sendJson(res, 404, { error: "unknown framing endpoint" });
    });
  },
});

const docsData = (): Plugin => ({
  name: "scriptindexer-docs-data",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url || "").split("?")[0];
      if (!url.startsWith("/data/")) {
        next();
        return;
      }
      const file = join(docs, decodeURIComponent(url));
      if (!file.startsWith(docs) || !existsSync(file) || !statSync(file).isFile()) {
        next();
        return;
      }
      const types: Record<string, string> = {
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webp": "image/webp",
      };
      res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      createReadStream(file).pipe(res);
    });
  },
});

export default defineConfig({
  base: "./",
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue", "pinia"],
      dirs: ["src/stores"],
      dts: "src/auto-imports.d.ts",
      vueTemplate: true,
    }),
    Components({
      dirs: ["src/components"],
      deep: true,
      dts: "src/components.d.ts",
    }),
    docsData(),
    framingData(),
  ],
  build: {
    outDir: docs,
    emptyOutDir: false,
    target: "baseline-widely-available",
    cssCodeSplit: false,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        entryFileNames: "assets/app-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
