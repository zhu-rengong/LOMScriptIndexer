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
  const current = scriptIdOf(router.currentRoute.value.params.id);
  if (!id || current === id) return;
  const target = { name: "script", params: { id } };
  if (current) void router.push(target);
  else void router.replace(target);
};

export const replaceScript = async (id: string): Promise<void> => {
  if (!id || scriptIdOf(router.currentRoute.value.params.id) === id) return;
  await router.replace({ name: "script", params: { id } });
};
