import { createRouter, createWebHashHistory } from "vue-router";

const SCRIPT_ID = /^[^/]+$/;

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [{ path: "/:id?", name: "script", component: { render: () => null } }],
});

export const scriptIdOf = (value: unknown): string => {
  const raw = Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  if (!raw) return "";
  try {
    const decoded = decodeURIComponent(raw);
    return SCRIPT_ID.test(decoded) ? decoded : "";
  } catch {
    return "";
  }
};

export const showScript = (id: string): void => {
  if (!id || router.currentRoute.value.params.id === id) return;
  void router.replace({ name: "script", params: { id } });
};
