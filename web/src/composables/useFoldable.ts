export const useFoldable = (
  key: string,
  enabled: () => boolean = () => true,
): WritableComputedRef<boolean> => {
  const fold = useFoldStore();
  const open = computed({
    get: () => fold.isOpen(key),
    set: (value: boolean) => fold.setOpen(key, value),
  });
  let registeredId = "";
  watch(
    enabled,
    (active) => {
      if (active) {
        registeredId = fold.register(key);
        return;
      }
      fold.unregister(registeredId);
      registeredId = "";
    },
    { immediate: true, flush: "sync" },
  );
  onUnmounted(() => fold.unregister(registeredId));
  return open;
};
