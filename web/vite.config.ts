import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import sirv from "sirv";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import { parseSettings } from "./src/framing/frames.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const docs = resolve(root, "..", "docs");
const previews = resolve(root, "..", "data", "cache", "portrait-previews");
const settingsFile = resolve(root, "..", "data", "portrait-framing.json");

const FRAME_LIMIT = 2 * 1024 * 1024;

type LoadedSettings = { settings: unknown; warning: string };

const readSettings = (): LoadedSettings => {
  if (!existsSync(settingsFile)) {
    return { settings: { version: 1, frames: {} }, warning: "settings file missing" };
  }
  try {
    const text = readFileSync(settingsFile, "utf8");
    const parsed = parseSettings(JSON.parse(text));
    return { settings: { version: 1, frames: parsed.frames }, warning: "" };
  } catch {
    return { settings: { version: 1, frames: {} }, warning: "settings file is not valid JSON" };
  }
};

const writeSettings = (settings: { frames: Record<string, unknown> }): void => {
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

const framingData = (): Plugin => {
  const art = sirv(previews, { dev: true, etag: true, maxAge: 600 });
  return {
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
          req.url = `/${route.slice("art/".length)}`;
          art(req, res, next);
          return;
        }

        if (route === "settings") {
          if (req.method === "POST") {
            readBody(req)
              .then((text) => {
                const parsed = parseSettings(JSON.parse(text));
                const settings = { version: 1, frames: parsed.frames };
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
          sendJson(res, 200, {
            ...(loaded.settings as Record<string, unknown>),
            warning: loaded.warning,
          });
          return;
        }

        sendJson(res, 404, { error: "unknown framing endpoint" });
      });
    },
  };
};

const docsData = (): Plugin => {
  const files = sirv(join(docs, "data"), { dev: true, etag: true });
  return {
    name: "scriptindexer-docs-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const url = (req.url || "").split("?")[0];
        const file = join(docs, "data", decodeURIComponent(url));
        if (!file.startsWith(join(docs, "data")) || !existsSync(file) || !statSync(file).isFile()) {
          next();
          return;
        }
        files(req, res, next);
      });
    },
  };
};

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
