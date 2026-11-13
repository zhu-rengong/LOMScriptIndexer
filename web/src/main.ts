import { loadDataset } from "./data/dataset";
import { languageMeta } from "./i18n/meta";
import en from "./locales/en.json";
import zhCn from "./locales/zh-cn.json";
import zhTw from "./locales/zh-tw.json";

const tables: Record<string, Record<string, string>> = {
  "zh-tw": zhTw,
  "zh-cn": zhCn,
  en,
};

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
  const table = tables[langOf()] || tables["zh-tw"] || {};
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

const boot = async () => {
  try {
    await loadDataset();
    const { start } = await import("./bootstrap");
    start();
  } catch (error) {
    showFatal(error);
  }
};

void boot();
