import { useTimeoutFn } from "@vueuse/core";
import { queryIndex } from "../lib/filter";
import { overlay } from "../lib/overlay";
import type { OverlayKey } from "../lib/overlayKeys";
import { query } from "../lib/query";
import type { QuerySuggestion } from "../types/query";

export type SuggestState = {
  isOpen: boolean;
  items: QuerySuggestion[];
  activeIndex: number;
  from: number;
  to: number;
  mode: string;
};

type AutocompleteOptions = {
  domId: string;
  suggestKey: OverlayKey;
  popoverKey: OverlayKey;
  onChange: () => void;
  onSubmit: () => void;
};

const emptyState = (): SuggestState => ({
  isOpen: false,
  items: [],
  activeIndex: 0,
  from: 0,
  to: 0,
  mode: "field",
});

export const useExprAutocomplete = (
  input: Ref<HTMLInputElement | null>,
  value: Ref<string>,
  options: AutocompleteOptions,
) => {
  const state = ref<SuggestState>(emptyState());

  const isOpen = computed(() => overlay.isOpen(options.suggestKey));

  const hide = (): void => {
    overlay.close(options.suggestKey);
  };

  const { start: scheduleHide } = useTimeoutFn(hide, 120, { immediate: false });

  const replaceRange = (start: number, end: number, text: string): void => {
    const current = value.value || "";
    value.value = current.slice(0, start) + text + current.slice(end);
    const caret = start + text.length;
    void nextTick(() => {
      const node = input.value;
      if (!node) return;
      node.setSelectionRange(caret, caret);
      node.focus();
    });
  };

  const insert = (text: string): void => {
    const node = input.value;
    if (!node) return;
    replaceRange(node.selectionStart || 0, node.selectionEnd || 0, text);
  };

  const update = (): void => {
    const node = input.value;
    if (!node) return;
    if (!node.value) {
      hide();
      return;
    }
    const result = query.suggest(
      node.value,
      node.selectionStart ?? node.value.length,
      queryIndex(),
    );
    state.value = {
      isOpen: true,
      items: result.items || [],
      activeIndex: 0,
      from: result.from,
      to: result.to,
      mode: result.mode,
    };
    void nextTick(() => {
      overlay.open(options.suggestKey, {
        trigger: node,
        keep: [options.popoverKey],
        placement: { align: "start", gap: 6, matchWidth: true, fit: true },
      });
    });
  };

  const accept = (index?: number): void => {
    const node = input.value;
    const item = state.value.items[index === undefined ? state.value.activeIndex : index];
    if (!node || !item) return;
    const text = item.insert || item.value;
    replaceRange(state.value.from, state.value.to, text);
    hide();
    options.onChange();
    if (/(:|\(|\s)$/.test(text)) update();
  };

  const onInput = (): void => {
    options.onChange();
    update();
  };

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") {
      if (state.value.isOpen) {
        event.preventDefault();
        event.stopPropagation();
      }
      hide();
      return;
    }
    const picking =
      state.value.isOpen &&
      state.value.items.length > 0 &&
      (event.key === "Tab" || event.key === "Enter");
    if (picking) {
      event.preventDefault();
      accept(state.value.activeIndex);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSubmit();
    }
  };

  const onKeyup = (event: KeyboardEvent): void => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].indexOf(event.key) >= 0) update();
  };

  const onBlur = (): void => {
    scheduleHide();
  };

  onMounted(() => {
    overlay.register(options.suggestKey, {
      id: options.domId,
      group: "menu",
      keep: [options.popoverKey],
      onHide: () => {
        state.value = emptyState();
      },
      placement: { align: "start", gap: 6, matchWidth: true, fit: true },
    });
  });

  onUnmounted(() => {
    overlay.unregister(options.suggestKey);
  });

  return { state, isOpen, update, hide, insert, accept, onInput, onKeydown, onKeyup, onBlur };
};
