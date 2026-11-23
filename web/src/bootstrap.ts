import "./styles/index.css";
import { createAppShell } from "./app";
import App from "./components/App.vue";
import { textStore } from "./data/text";
import { syncLocale } from "./i18n";
import { popovers } from "./lib/popover";
import { installPrefsDom } from "./lib/prefsDom";
import { searchIndex } from "./lib/searchIndex";
import { router } from "./router";

export const start = (): void => {
  const app = createAppShell(App);
  app.use(router);
  installPrefsDom(usePrefsStore(pinia));

  const script = useScriptStore(pinia);
  const filter = useFilterStore(pinia);

  script.restoreLang();
  syncLocale(script.lang);

  app.mount("#app");
  popovers.install();
  useHistoryStore(pinia);

  watch(
    () => script.lang,
    (lang) => syncLocale(lang),
  );

  textStore.ensureHead(script.textLang()).then(() => {
    searchIndex.invalidate();
    searchIndex.warm();
    if (filter.source.trim()) filter.apply(filter.source);
  });
};
