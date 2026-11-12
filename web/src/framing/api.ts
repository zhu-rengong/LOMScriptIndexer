import type { FrameMap, FramingIndex, Settings } from "./frames";
import { DEFAULT_AVATAR, parseSettings } from "./frames";

const BASE = "/framing-data";

type Payload = Record<string, unknown>;

const readJson = async (response: Response): Promise<Payload> => {
  const payload = (await response.json().catch(() => null)) as Payload | null;
  if (!response.ok) {
    const detail = typeof payload?.error === "string" ? payload.error : "";
    throw new Error(detail || `request failed (${response.status})`);
  }
  if (!payload || typeof payload !== "object") throw new Error("empty response");
  return payload;
};

export const artUrl = (file: string): string => `${BASE}/art/${encodeURIComponent(file)}`;

export const fetchIndex = async (): Promise<FramingIndex> => {
  const payload = await readJson(await fetch(`${BASE}/index.json`, { cache: "no-store" }));
  const artifacts = payload.artifacts;
  const characters = payload.characters;
  const avatar = payload.avatar;
  if (
    !artifacts ||
    typeof artifacts !== "object" ||
    !characters ||
    typeof characters !== "object"
  ) {
    throw new Error("preview index is malformed; run scriptindexer-extract");
  }
  if (!Array.isArray(avatar) || avatar.length < 2) {
    throw new Error("preview index has no avatar size; run scriptindexer-extract");
  }
  const headBand = Number(payload.head_band);
  return {
    version: Number(payload.version) || 0,
    avatar: [Number(avatar[0]) || DEFAULT_AVATAR[0], Number(avatar[1]) || DEFAULT_AVATAR[1]],
    head_band: Number.isFinite(headBand) && headBand > 0 ? headBand : 0.42,
    assets: String(payload.assets ?? ""),
    settings: String(payload.settings ?? ""),
    artifacts: artifacts as FramingIndex["artifacts"],
    characters: characters as FramingIndex["characters"],
  };
};

export type SettingsResponse = { frames: FrameMap; warning: string };

export const fetchSettings = async (): Promise<SettingsResponse> => {
  const payload = await readJson(await fetch(`${BASE}/settings`, { cache: "no-store" }));
  const parsed = parseSettings(payload);
  const warning = typeof payload.warning === "string" ? payload.warning : "";
  return { frames: parsed.frames, warning };
};

export const saveSettings = async (settings: Settings): Promise<FrameMap> => {
  const response = await fetch(`${BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const payload = await readJson(response);
  return parseSettings(payload.settings).frames;
};
