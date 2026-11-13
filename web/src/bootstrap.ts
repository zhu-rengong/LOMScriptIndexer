import { createApp } from "vue";
import "./styles/index.css";
import App from "./components/App.vue";
import { readHash } from "./composables/useHashRoute";
import { graph } from "./data/graph";
import { textStore } from "./data/text";
import { syncLocale } from "./i18n";
import { applyFilter } from "./lib/filter";
import { exportScripts } from "./lib/scriptExport";
import { searchIndex } from "./lib/search";
import { pinia } from "./stores";
import { usePrefsStore } from "./stores/prefs";
import { useScriptStore } from "./stores/script";

export const start = (): void => {
  const app = createApp(App);
  app.use(pinia);
  usePrefsStore(pinia);

  const script = useScriptStore(pinia);
  script.restoreLang();
  syncLocale(script.lang);

  const appInstance = app.mount("#app");
  void appInstance;

  (window as unknown as { SR?: unknown }).SR = { exportScripts };
  console.info("[ScriptIndexer] developer export: SR.exportScripts()");

  watch(
    () => script.lang,
    (lang) => syncLocale(lang),
  );

  const startId = readHash() || script.selectedId;
  if (startId && graph.nodeById.has(startId)) {
    script.select(startId, { history: true });
  }

  textStore.ensureHead(script.textLang()).then(() => {
    searchIndex.invalidate();
    if (script.filterSource.trim()) applyFilter(script.filterSource);
  });
};
