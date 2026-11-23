import { onKeyStroke } from "@vueuse/core";
import { isTypingTarget } from "../lib/dom";

export type ShortcutHandlers = {
  back: () => void;
  forward: () => void;
  bookmark: () => void;
  jump: () => void;
  help: () => void;
  search: () => void;
  infer: () => void;
  reveal: () => void;
  fold: () => void;
};

type BindOptions = {
  preventDefault?: boolean;
  dedupe?: boolean;
};

const typingInField = (): boolean => isTypingTarget(document.activeElement);

const idle = (event: KeyboardEvent): boolean =>
  !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.altKey && !typingInField();

const bind = (
  match: (event: KeyboardEvent) => boolean,
  action: () => void,
  options?: BindOptions,
): void => {
  const dedupe = !!options?.dedupe;
  const prevent = options?.preventDefault !== false;
  onKeyStroke(
    (event) => idle(event) && match(event),
    (event) => {
      if (prevent) event.preventDefault();
      action();
    },
    { target: document, dedupe },
  );
};

export const useShortcuts = (handlers: ShortcutHandlers): void => {
  const letter = (event: KeyboardEvent): string => String(event.key || "").toLowerCase();

  bind((event) => event.key === "?", handlers.help);
  bind((event) => event.key === "/", handlers.search);
  bind((event) => event.key === "ArrowLeft", handlers.back);
  bind((event) => event.key === "ArrowRight", handlers.forward);
  bind((event) => letter(event) === "b", handlers.bookmark);
  bind((event) => letter(event) === "f", handlers.infer);
  bind((event) => letter(event) === "h", handlers.reveal, { dedupe: true });
  bind((event) => letter(event) === "v", handlers.fold, { dedupe: true });
  bind((event) => letter(event) === "j", handlers.jump, { preventDefault: false });
};
