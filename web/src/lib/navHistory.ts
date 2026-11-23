import { readonly, ref } from "vue";
import { router } from "../router";

type RouterState = {
  back?: unknown;
  forward?: unknown;
};

const backAvailable = ref(false);
const forwardAvailable = ref(false);

const stateOf = (): RouterState => router.options.history.state as unknown as RouterState;

export const refreshNavHistory = (): void => {
  const state = stateOf();
  backAvailable.value = !!state.back;
  forwardAvailable.value = !!state.forward;
};

export const canBack = readonly(backAvailable);

export const canForward = readonly(forwardAvailable);

export const navBack = (): void => router.back();

export const navForward = (): void => router.forward();

export const installNavHistory = (): void => {
  router.afterEach(() => refreshNavHistory());
  refreshNavHistory();
};
