export const useFoldable = (
  key: string,
  enabled: () => boolean = () => true,
): WritableComputedRef<boolean> => {
  const fold = useFoldStore();
  const open = computed({
    get: () => fold.isOpen(key),
    set: (value: boolean) => fold.setOpen(key, value),
  });
  watch(
    enabled,
    (active) => {
      if (active) fold.register(key);
      else fold.unregister(key);
    },
    { immediate: true, flush: "sync" },
  );
  onUnmounted(() => fold.unregister(key));
  return open;
};
