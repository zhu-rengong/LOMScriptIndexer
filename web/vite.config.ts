import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
import vue from "@vitejs/plugin-vue";
import sirv from "sirv";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { defineConfig } from "vite";
import { parseSettings } from "./src/framing/frames.ts";
import { STORAGE_KEYS } from "./src/lib/storageKeys.ts";

const root = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(root, "..");
const docs = resolve(repoRoot, "docs");
const previews = resolve(repoRoot, "data", "cache", "portrait-previews");
const settingsFile = resolve(repoRoot, "data", "portrait-framing.json");

const readJsonVersion = (file: string): string => {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "";
  } catch {
    return "";
  }
};

const readTomlVersion = (file: string): string => {
  try {
    const match = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(file, "utf8"));
    return match ? match[1] : "";
  } catch {
    return "";
  }
};

const git = (args: string[]): string => {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

const httpsRemote = (remote: string): string => {
  const value = remote.trim().replace(/\.git$/, "");
  if (!value) return "";
  const scp = /^git@([^:]+):(.+)$/.exec(value);
  if (scp) return `https://${scp[1]}/${scp[2]}`;
  const ssh = /^ssh:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/.exec(value);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  if (/^https?:\/\//.test(value)) return value.replace(/^(\w+:\/\/)[^@/]+@/, "$1");
  return "";
};

const webVersion = readJsonVersion(resolve(root, "package.json"));
const pyVersion = readTomlVersion(resolve(repoRoot, "pyproject.toml"));
const commitSha = git(["rev-parse", "HEAD"]);
const commit = commitSha.slice(0, 7);
const repoUrl = httpsRemote(git(["config", "--get", "remote.origin.url"]));
const commitUrl = commitSha && repoUrl ? `${repoUrl}/commit/${commitSha}` : "";

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

const storageKeys = (): Plugin => ({
  name: "scriptindexer-storage-keys",
  transformIndexHtml: (html) => html.replaceAll("__PREFS_STORAGE_KEY__", STORAGE_KEYS.prefs),
});

export default defineConfig({
  base: "./",
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(webVersion),
    "import.meta.env.VITE_PY_VERSION": JSON.stringify(pyVersion),
    "import.meta.env.VITE_GIT_COMMIT": JSON.stringify(commit),
    "import.meta.env.VITE_GIT_COMMIT_URL": JSON.stringify(commitUrl),
  },
  plugins: [
    vue(),
    VueI18nPlugin({
      include: [
        resolve(root, "src/locales/en.json"),
        resolve(root, "src/locales/zh-cn.json"),
        resolve(root, "src/locales/zh-tw.json"),
      ],
    }),
    storageKeys(),
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
