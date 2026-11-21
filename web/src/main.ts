import type { TranslationKey } from "./i18n";
import { syncLocale, t } from "./i18n";
import { languageMeta } from "./i18n/meta";
import { measure, watchLongTasks } from "./lib/perf";

const langOf = (): string => {
  const html = String(document.documentElement.lang || "").toLowerCase();
  for (const id of Object.keys(languageMeta)) {
    if (String(languageMeta[id].html || "").toLowerCase() === html) return id;
  }
  if (html.indexOf("hans") >= 0) return "zh-cn";
  if (html.indexOf("en") === 0) return "en";
  return "zh-tw";
};

const label = (key: TranslationKey, fallback: string): string => {
  const value = t(key);
  return value && value !== key ? value : fallback;
};

const showFatal = (error: unknown) => {
  syncLocale(langOf());
  const body = document.body;
  const message = error instanceof Error ? error.message : String(error);
  body.replaceChildren();
  const panel = document.createElement("div");
  panel.style.cssText =
    "max-width:640px;margin:12vh auto;padding:32px;font-family:var(--font-base,system-ui,sans-serif);line-height:1.7;color:var(--ink,currentColor)";
  const title = document.createElement("h1");
  title.style.cssText = "font-size:22px;margin:0 0 12px";
  title.textContent = label("errorTitle", "Failed to load");
  const text = document.createElement("p");
  text.style.cssText = "margin:0 0 20px;color:var(--ink-2,currentColor);word-break:break-word";
  text.textContent = message;
  const button = document.createElement("button");
  button.type = "button";
  button.style.cssText =
    "padding:8px 18px;border:1px solid currentColor;border-radius:2px;background:transparent;color:inherit;cursor:pointer";
  button.textContent = label("errorReload", "Reload");
  button.addEventListener("click", () => location.reload());
  panel.appendChild(title);
  panel.appendChild(text);
  panel.appendChild(button);
  body.appendChild(panel);
};

const boot = async () => {
  watchLongTasks();
  try {
    await measure("dataset", () => useDataStore(pinia).load());
    await measure("bootstrap", async () => {
      const { start } = await import("./bootstrap");
      start();
    });
  } catch (error) {
    showFatal(error);
  }
};

void boot();
