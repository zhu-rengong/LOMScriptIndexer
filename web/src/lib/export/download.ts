import { strToU8, zip } from "fflate";
import { ref } from "vue";
import { checkpoints } from "../../data/checkpoints";
import { textStore } from "../../data/text";
import { t } from "../../i18n";
import { pinia } from "../../stores";
import { useUiStore } from "../../stores/ui";
import { buildExportFiles, exportFileName, exportLanguage } from "./format";

const running = ref(false);

export const exportRunning = running;

const zipTextFiles = async (files: { name: string; content: string }[]): Promise<Blob> => {
  const data: Record<string, Uint8Array> = {};
  for (const file of files) data[file.name] = strToU8(file.content);
  const zipped = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    zip(data, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  return new Blob([zipped], { type: "application/zip" });
};

const saveBlob = (filename: string, blob: Blob): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportScripts = async (): Promise<void> => {
  if (running.value) return;
  running.value = true;
  const lang = exportLanguage();
  const ui = useUiStore(pinia);
  try {
    const total = textStore.progress().total;
    ui.setIoStatus(t("exportLoading", { done: 0, total }));
    const textOk = await textStore.ensureAll(lang, (done, count) => {
      ui.setIoStatus(t("exportLoading", { done, total: count }));
    });
    if (!textOk) throw new Error("text shards failed to load");
    ui.setIoStatus(t("exportBuilding"));
    const checkpointOk = await checkpoints.loadAll();
    const { files, count } = buildExportFiles(lang, checkpointOk);
    if (!count) throw new Error("no scripts to export");
    ui.setIoStatus(t("exportPacking"));
    const blob = await zipTextFiles(files);
    saveBlob(exportFileName(lang), blob);
    ui.toast(t("exportDone", { n: count }));
  } catch (error) {
    console.error("[ScriptIndexer] script export failed", error);
    ui.toast(t("exportFailed"));
  } finally {
    ui.setIoStatus("");
    running.value = false;
  }
};
