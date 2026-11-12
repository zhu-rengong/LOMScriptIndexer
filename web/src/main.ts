import { DATA_SCHEMA } from "./data/schema";
import { dict, languageMeta } from "./i18n/dict";
import { loadScript } from "./lib/browser";

const langOf = (): string => {
  const html = String(document.documentElement.lang || "").toLowerCase();
  for (const id of Object.keys(languageMeta)) {
    if (String(languageMeta[id].html || "").toLowerCase() === html) return id;
  }
  if (html.indexOf("hans") >= 0) return "zh-cn";
  if (html.indexOf("en") === 0) return "en";
  return "zh-tw";
};

const showFatal = (error: unknown) => {
  const body = document.body;
  const message = error instanceof Error ? error.message : String(error);
  const table = dict[langOf()] || dict["zh-tw"] || {};
  body.replaceChildren();
  const panel = document.createElement("div");
  panel.style.cssText =
    "max-width:640px;margin:12vh auto;padding:32px;font-family:var(--font-base,system-ui,sans-serif);line-height:1.7;color:var(--ink,currentColor)";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0 0 12px";
  title.textContent = table.errorTitle || "Failed to load";
  const text = document.createElement("p");
  text.style.cssText = "margin:0 0 20px;color:var(--ink-2,currentColor);word-break:break-word";
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.style.cssText =
    "padding:8px 18px;border:1px solid currentColor;border-radius:2px;background:transparent;color:inherit;cursor:pointer";
  button.textContent = table.errorReload || "Reload";
  button.addEventListener("click", () => location.reload());
  panel.appendChild(title);
  panel.appendChild(text);
  panel.appendChild(button);
  body.appendChild(panel);
};

window.addEventListener(
  "error",
  (event) => {
    const target = event.target as HTMLScriptElement | null;
    if (target && target.tagName === "SCRIPT" && target.src && /\/data\//.test(target.src)) {
      const table = dict[langOf()] || dict["zh-tw"] || {};
      showFatal(new Error(`${table.errorMissing || "Failed to load"}: ${target.src}`));
    }
  },
  true,
);

const boot = async () => {
  try {
    if (!window.SR_DATA) await loadScript(`data/graph.js?v=${DATA_SCHEMA}`);
    if (!window.SR_VARREADS) await loadScript(`data/var-reads.js?v=${DATA_SCHEMA}`);
    if (!window.SR_MISSIONS) await loadScript(`data/missions.js?v=${DATA_SCHEMA}`);
    const { start } = await import("./bootstrap");
    start();
  } catch (error) {
    showFatal(error);
  }
};

void boot();
