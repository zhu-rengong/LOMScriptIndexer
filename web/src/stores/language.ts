import { readDataset } from "../data/access";
import { textStore } from "../data/text";
import { syncLocale } from "../i18n";
import { lang as langState } from "../lib/lang";
import { popovers } from "../lib/popover";
import { searchIndex } from "../lib/searchIndex";
import { useScriptStore } from "./script";

export const useLanguageStore = defineStore("language", () => {
  let token = 0;

  const switchTo = async (id: string): Promise<void> => {
    if (!id) return;
    const script = useScriptStore(pinia);
    const filter = useFilterStore(pinia);
    const current = ++token;
    const content = readDataset().meta.langs.indexOf(id) >= 0 ? id : script.textLang();
    const ok = await textStore.ensureHead(content);
    if (current !== token || !ok) return;
    if (!script.setLang(id)) return;
    syncLocale(id);
    langState.applyDocument(id);
    popovers.close("lookup");
    searchIndex.invalidate();
    searchIndex.warm();
    filter.refresh();
  };

  return { switchTo };
});
