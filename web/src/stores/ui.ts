import { useTimeoutFn } from "@vueuse/core";
import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const toastText = ref("");
  const ioText = ref("");

  const { start: scheduleClear } = useTimeoutFn(
    () => {
      toastText.value = "";
    },
    2400,
    { immediate: false },
  );

  const toast = (message: string): void => {
    if (!message) return;
    toastText.value = message;
    scheduleClear();
  };

  const setIoStatus = (message: string): void => {
    ioText.value = message ? String(message) : "";
  };

  return { toastText, ioText, toast, setIoStatus };
});
