import type { LocationQuery, LocationQueryRaw } from "vue-router";
import { isOverlayKey } from "../ui/ids";
import type { OverlayKey } from "../ui/ids";

export type OverlayPayload = {
  kind?: string;
  key?: string;
  method?: string;
};

const PANEL = "panel";
const KIND = "panelKind";
const KEY = "panelKey";
const METHOD = "panelMethod";

const textOf = (value: LocationQuery[string] | LocationQueryRaw[string]): string => {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw == null ? "" : String(raw);
};

export const panelOf = (query: LocationQuery): OverlayKey | null => {
  const value = textOf(query[PANEL]);
  return isOverlayKey(value) ? value : null;
};

export const payloadOf = (query: LocationQuery): OverlayPayload => ({
  kind: textOf(query[KIND]),
  key: textOf(query[KEY]),
  method: textOf(query[METHOD]),
});

export const stripPanel = (query: LocationQueryRaw): LocationQueryRaw => {
  const next: LocationQueryRaw = { ...query };
  delete next[PANEL];
  delete next[KIND];
  delete next[KEY];
  delete next[METHOD];
  return next;
};

export const withPanel = (
  query: LocationQueryRaw,
  panel: OverlayKey,
  payload?: OverlayPayload,
): LocationQueryRaw => {
  const next = stripPanel(query);
  next[PANEL] = panel;
  if (payload?.kind) next[KIND] = payload.kind;
  if (payload?.key) next[KEY] = payload.key;
  if (payload?.method) next[METHOD] = payload.method;
  return next;
};
