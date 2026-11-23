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

const navigate = (id: string, replace: boolean): void => {
  const current = scriptIdOf(router.currentRoute.value.params.id);
  if (!id || current === id) return;
  const target = { name: "script", params: { id } };
  if (replace) void router.replace(target);
  else void router.push(target);
};

export const showScript = (id: string): void =>
  navigate(id, !scriptIdOf(router.currentRoute.value.params.id));

export const replaceScript = (id: string): void => navigate(id, true);
