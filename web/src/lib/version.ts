export const versionInfo = {
  py: import.meta.env.VITE_PY_VERSION || "",
  web: import.meta.env.VITE_APP_VERSION || "",
  commit: import.meta.env.VITE_GIT_COMMIT || "",
  commitUrl: import.meta.env.VITE_GIT_COMMIT_URL || "",
};
