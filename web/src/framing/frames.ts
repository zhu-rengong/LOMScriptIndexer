export type Frame = { x: number; y: number; w: number };

export type Artifact = { file: string; size: [number, number]; default: Frame };

export type FramingIndex = {
  version: number;
  avatar: [number, number];
  head_band: number;
  assets: string;
  settings: string;
  artifacts: Record<string, Artifact>;
  characters: Record<string, { label?: string; expressions: Record<string, string> }>;
};

export type Settings = { version: 1; frames: FrameMap };

export type FrameMap = Record<string, Record<string, Frame>>;

export type FrameBox = { x: number; y: number; w: number; h: number };

export const MIN_WIDTH = 0.01;
export const EPSILON = 0.0005;
export const DIGITS = 5;
export const DEFAULT_AVATAR: [number, number] = [80, 92];

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number): number => Number(value.toFixed(DIGITS));

export const roundFrame = (frame: Frame): Frame => ({
  x: round(frame.x),
  y: round(frame.y),
  w: round(frame.w),
});

export const avatarAspect = (size: [number, number]): number =>
  size[1] ? size[0] / size[1] : DEFAULT_AVATAR[0] / DEFAULT_AVATAR[1];

export const frameHeight = (width: number, artifact: Artifact, aspect: number): number =>
  (width * artifact.size[0]) / (aspect * artifact.size[1]);

export const maxFrameWidth = (artifact: Artifact, aspect: number): number =>
  clamp((aspect * artifact.size[1]) / artifact.size[0], MIN_WIDTH, 1);

export const clampFrame = (frame: Frame, artifact: Artifact, aspect: number): Frame => {
  const width = clamp(frame.w, MIN_WIDTH, maxFrameWidth(artifact, aspect));
  const height = frameHeight(width, artifact, aspect);
  return {
    x: clamp(frame.x, 0, 1 - width),
    y: clamp(frame.y, 0, 1 - height),
    w: width,
  };
};

export const frameBox = (frame: Frame, artifact: Artifact, aspect: number): FrameBox => {
  const [width, height] = artifact.size;
  let boxW = Math.max(1, Math.round(frame.w * width));
  let boxH = Math.max(1, Math.round(boxW / aspect));
  if (boxH > height) {
    boxH = height;
    boxW = Math.max(1, Math.round(boxH * aspect));
  }
  if (boxW > width) {
    boxW = width;
    boxH = Math.max(1, Math.min(height, Math.round(boxW / aspect)));
  }
  const left = clamp(Math.round(frame.x * width), 0, Math.max(0, width - boxW));
  const top = clamp(Math.round(frame.y * height), 0, Math.max(0, height - boxH));
  return { x: left / width, y: top / height, w: boxW / width, h: boxH / height };
};

export const sameFrame = (left: Frame, right: Frame): boolean =>
  Math.abs(left.x - right.x) <= EPSILON &&
  Math.abs(left.y - right.y) <= EPSILON &&
  Math.abs(left.w - right.w) <= EPSILON;

export const defaultFrame = (artifact: Artifact): Frame => ({ ...artifact.default });

const toFrame = (value: unknown): Frame | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const { x, y, w } = record;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w)) return null;
  return { x: Number(x), y: Number(y), w: Number(w) };
};

export type ParsedSettings = { frames: FrameMap; dropped: number };

export const parseSettings = (value: unknown): ParsedSettings => {
  const frames: FrameMap = {};
  let dropped = 0;
  const root = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const raw = (root as Record<string, unknown>).frames;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { frames, dropped };
  for (const [character, table] of Object.entries(raw as Record<string, unknown>)) {
    if (!character || !table || typeof table !== "object" || Array.isArray(table)) {
      dropped += 1;
      continue;
    }
    const entries: Record<string, Frame> = {};
    for (const [expression, frame] of Object.entries(table as Record<string, unknown>)) {
      const parsed = toFrame(frame);
      if (!expression || !parsed) {
        dropped += 1;
        continue;
      }
      entries[expression] = parsed;
    }
    if (Object.keys(entries).length) frames[character] = entries;
  }
  return { frames, dropped };
};

const mergeOrphans = (target: FrameMap, orphans: FrameMap): void => {
  for (const character of Object.keys(orphans).sort()) {
    const entries = orphans[character];
    if (!entries) continue;
    const table: Record<string, Frame> = {};
    for (const expression of Object.keys(entries).sort()) {
      table[expression] = roundFrame(entries[expression]);
    }
    if (Object.keys(table).length) target[character] = { ...target[character], ...table };
  }
};

export const buildSettings = (
  index: FramingIndex,
  frames: FrameMap,
  orphans: FrameMap,
): Settings => {
  const output: FrameMap = {};
  for (const character of Object.keys(index.characters).sort()) {
    const table = index.characters[character].expressions;
    const current = frames[character] || {};
    const entries: Record<string, Frame> = {};
    for (const expression of Object.keys(table).sort()) {
      const artifact = index.artifacts[table[expression]];
      const frame = current[expression];
      if (!artifact || !frame || sameFrame(frame, artifact.default)) continue;
      entries[expression] = roundFrame(frame);
    }
    if (Object.keys(entries).length) output[character] = entries;
  }
  mergeOrphans(output, orphans);
  return { version: 1, frames: output };
};

export const settingsText = (settings: Settings): string =>
  `${JSON.stringify(settings, null, 2)}\n`;

export const countFrames = (frames: FrameMap): number =>
  Object.values(frames).reduce((total, table) => total + Object.keys(table).length, 0);
