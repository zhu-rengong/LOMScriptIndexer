import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { fetchIndex, fetchSettings, saveSettings } from "../framing/api";
import type {
  Artifact,
  ArtifactUse,
  Frame,
  FrameMap,
  FramingIndex,
  Settings,
} from "../framing/frames";
import {
  artifactUses,
  avatarAspect,
  buildSettings,
  clampFrame,
  countFrames,
  defaultFrame,
  frameBox,
  maxFrameWidth,
  parseSettings,
  sameFrame,
  settingsText,
} from "../framing/frames";

export type ExpressionRow = { name: string; customized: boolean; saved: boolean };

export type CharacterRow = {
  id: string;
  label: string;
  expressions: ExpressionRow[];
  customized: number;
  saved: number;
  partial: boolean;
};

export type FrameSelection = {
  character: string;
  expression: string;
  label: string;
  artifactId: string;
  artifact: Artifact;
  frame: Frame;
};

export type FrameClipboard = { frame: Frame; label: string; expression: string };

const EMPTY: Settings = { version: 1, frames: {} };

export const useFramingStore = defineStore("framing", () => {
  const index = ref<FramingIndex | null>(null);
  const frames = ref<FrameMap>({});
  const disk = ref<FrameMap>({});
  const orphans = ref<FrameMap>({});
  const diskText = ref("");
  const selection = ref<{ character: string; expression: string } | null>(null);
  const clipboard = ref<FrameClipboard | null>(null);
  const query = ref("");
  const status = ref<"idle" | "loading" | "ready" | "error">("idle");
  const error = ref("");
  const notice = ref("");
  const saving = ref(false);

  const avatarSize = computed<[number, number]>(() => index.value?.avatar ?? [80, 92]);
  const aspect = computed(() => avatarAspect(avatarSize.value));
  const headBand = computed(() => index.value?.head_band ?? 0.42);

  const labelOf = (character: string): string =>
    index.value?.characters[character]?.label || character;

  const resolveArtifact = (
    character: string,
    expression: string,
  ): { id: string; artifact: Artifact } | null => {
    const data = index.value;
    const id = data?.characters[character]?.expressions[expression];
    const artifact = id ? data?.artifacts[id] : undefined;
    return id && artifact ? { id, artifact } : null;
  };

  const current = computed<FrameSelection | null>(() => {
    const picked = selection.value;
    const data = index.value;
    if (!picked || !data) return null;
    const resolved = resolveArtifact(picked.character, picked.expression);
    if (!resolved) return null;
    const frame = frames.value[picked.character]?.[picked.expression] ?? resolved.artifact.default;
    return {
      ...picked,
      label: labelOf(picked.character),
      artifactId: resolved.id,
      artifact: resolved.artifact,
      frame,
    };
  });

  const uses = computed<Map<string, ArtifactUse[]>>(() =>
    index.value ? artifactUses(index.value) : new Map(),
  );

  const sharedUses = computed<ArtifactUse[]>(() => {
    const active = current.value;
    return active ? (uses.value.get(active.artifactId) ?? []) : [];
  });

  const sharedCount = computed(() => sharedUses.value.length);

  const sharedCharacters = computed(
    () => new Set(sharedUses.value.map((use) => use.character)).size,
  );

  const hasClipboard = computed(() => clipboard.value !== null);

  const clipboardSource = computed(() => {
    const held = clipboard.value;
    return held ? `${held.label} / ${held.expression}` : "";
  });

  const payload = computed<Settings>(() => {
    const data = index.value;
    return data ? buildSettings(data, frames.value, orphans.value) : EMPTY;
  });

  const dirty = computed(() => settingsText(payload.value) !== diskText.value);

  const rows = computed<CharacterRow[]>(() => {
    const data = index.value;
    if (!data) return [];
    const needle = query.value.trim().toLowerCase();
    const ids = Object.keys(data.characters).sort((left, right) =>
      labelOf(left).localeCompare(labelOf(right)),
    );
    const result: CharacterRow[] = [];
    for (const id of ids) {
      const entry = data.characters[id];
      const label = entry.label || id;
      const expressions = Object.keys(entry.expressions)
        .sort()
        .map((name) => {
          const artifact = data.artifacts[entry.expressions[name]];
          const frame = frames.value[id]?.[name];
          const stored = disk.value[id]?.[name];
          return {
            name,
            customized: Boolean(artifact && frame && !sameFrame(frame, artifact.default)),
            saved: Boolean(artifact && stored && !sameFrame(stored, artifact.default)),
          };
        });
      const matchCharacter =
        !needle || label.toLowerCase().includes(needle) || id.toLowerCase().includes(needle);
      const visible = matchCharacter
        ? expressions
        : expressions.filter((row) => row.name.toLowerCase().includes(needle));
      if (!visible.length) continue;
      result.push({
        id,
        label,
        expressions: visible,
        customized: expressions.filter((row) => row.customized).length,
        saved: expressions.filter((row) => row.saved).length,
        partial: Boolean(needle && !matchCharacter),
      });
    }
    return result;
  });

  const expressionCount = computed(() => {
    const data = index.value;
    if (!data) return 0;
    return Object.values(data.characters).reduce(
      (total, entry) => total + Object.keys(entry.expressions).length,
      0,
    );
  });

  const customizedCount = computed(() => {
    const data = index.value;
    if (!data) return 0;
    let total = 0;
    for (const [character, entry] of Object.entries(data.characters)) {
      for (const [expression, artifactId] of Object.entries(entry.expressions)) {
        const artifact = data.artifacts[artifactId];
        const frame = frames.value[character]?.[expression];
        if (artifact && frame && !sameFrame(frame, artifact.default)) total += 1;
      }
    }
    return total;
  });

  const diskCount = computed(() => countFrames(disk.value));

  const buildFrames = (data: FramingIndex, source: FrameMap): FrameMap => {
    const ratio = avatarAspect(data.avatar);
    const result: FrameMap = {};
    for (const [character, entry] of Object.entries(data.characters)) {
      const table: Record<string, Frame> = {};
      for (const [expression, artifactId] of Object.entries(entry.expressions)) {
        const artifact = data.artifacts[artifactId];
        if (!artifact) continue;
        const stored = source[character]?.[expression];
        table[expression] = clampFrame(stored ?? artifact.default, artifact, ratio);
      }
      result[character] = table;
    }
    return result;
  };

  const pickOrphans = (data: FramingIndex, source: FrameMap): FrameMap => {
    const result: FrameMap = {};
    for (const [character, table] of Object.entries(source)) {
      const known = data.characters[character]?.expressions ?? {};
      const entries: Record<string, Frame> = {};
      for (const [expression, frame] of Object.entries(table)) {
        if (!known[expression]) entries[expression] = { ...frame };
      }
      if (Object.keys(entries).length) result[character] = entries;
    }
    return result;
  };

  const select = (character: string, expression: string): void => {
    selection.value = { character, expression };
  };

  const selectFirst = (): void => {
    const data = index.value;
    if (!data) return;
    const character = Object.keys(data.characters).sort()[0];
    if (!character) return;
    const expression = Object.keys(data.characters[character].expressions).sort()[0];
    if (expression) select(character, expression);
  };

  const load = async (): Promise<void> => {
    status.value = "loading";
    error.value = "";
    try {
      const [data, stored] = await Promise.all([fetchIndex(), fetchSettings()]);
      index.value = data;
      frames.value = buildFrames(data, stored.frames);
      orphans.value = pickOrphans(data, stored.frames);
      disk.value = stored.frames;
      diskText.value = settingsText(buildSettings(data, frames.value, orphans.value));
      if (stored.warning) notice.value = stored.warning;
      const picked = selection.value;
      if (!picked || !data.characters[picked.character]?.expressions[picked.expression]) {
        selectFirst();
      }
      status.value = "ready";
    } catch (err) {
      status.value = "error";
      error.value = err instanceof Error ? err.message : "failed to load framing data";
    }
  };

  const setFrame = (next: Frame): void => {
    const active = current.value;
    if (!active) return;
    const table = frames.value[active.character];
    if (!table) return;
    table[active.expression] = clampFrame(next, active.artifact, aspect.value);
  };

  const resetFrame = (): void => {
    const active = current.value;
    if (!active) return;
    setFrame(defaultFrame(active.artifact));
  };

  const copyFrame = (): void => {
    const active = current.value;
    if (!active) return;
    clipboard.value = {
      frame: { ...active.frame },
      label: active.label,
      expression: active.expression,
    };
    notice.value = `copied framing from ${active.label} / ${active.expression}`;
  };

  const pasteFrame = (): void => {
    const active = current.value;
    const held = clipboard.value;
    if (!active || !held) return;
    setFrame(held.frame);
    notice.value = `pasted framing from ${held.label} / ${held.expression}`;
  };

  const nudge = (dx: number, dy: number): void => {
    const active = current.value;
    if (!active) return;
    setFrame({ x: active.frame.x + dx, y: active.frame.y + dy, w: active.frame.w });
  };

  const zoomBy = (factor: number): void => {
    const active = current.value;
    if (!active) return;
    const box = frameBox(active.frame, active.artifact, aspect.value);
    const width = clampFrame(
      { ...active.frame, w: active.frame.w * factor },
      active.artifact,
      aspect.value,
    ).w;
    const ratio = width / active.frame.w;
    const centerX = box.x + box.w / 2;
    const centerY = box.y + box.h / 2;
    setFrame({
      x: centerX - (box.w * ratio) / 2,
      y: centerY - (box.h * ratio) / 2,
      w: width,
    });
  };

  const applyToCharacter = (): void => {
    const active = current.value;
    const data = index.value;
    if (!active || !data) return;
    const table = frames.value[active.character];
    const entry = data.characters[active.character];
    if (!table) return;
    let applied = 0;
    for (const [expression, artifactId] of Object.entries(entry.expressions)) {
      const artifact = data.artifacts[artifactId];
      if (!artifact) continue;
      table[expression] = clampFrame(active.frame, artifact, aspect.value);
      applied += 1;
    }
    notice.value = `applied framing to ${applied} expressions`;
  };

  const applyToArtwork = (): void => {
    const active = current.value;
    const targets = sharedUses.value;
    if (!active || targets.length < 2) return;
    const applied = clampFrame(active.frame, active.artifact, aspect.value);
    let expressions = 0;
    const characters = new Set<string>();
    for (const use of targets) {
      const table = frames.value[use.character];
      if (!table) continue;
      table[use.expression] = { ...applied };
      expressions += 1;
      characters.add(use.character);
    }
    notice.value = `applied framing to ${expressions} shared expressions across ${characters.size} characters`;
  };

  const importText = (text: string): boolean => {
    const data = index.value;
    if (!data) return false;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      notice.value = "imported file is not valid JSON";
      return false;
    }
    const settings = parseSettings(parsed);
    frames.value = buildFrames(data, settings.frames);
    orphans.value = pickOrphans(data, settings.frames);
    const total = countFrames(buildSettings(data, frames.value, orphans.value).frames);
    notice.value = settings.dropped
      ? `imported ${total} frames, ignored ${settings.dropped} invalid entries`
      : `imported ${total} frames`;
    return true;
  };

  const download = (): void => {
    const blob = new Blob([settingsText(payload.value)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "portrait-framing.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = "settings file downloaded";
  };

  const persist = async (): Promise<void> => {
    if (!index.value || saving.value) return;
    saving.value = true;
    try {
      const sent = payload.value;
      await saveSettings(sent);
      disk.value = sent.frames;
      diskText.value = settingsText(sent);
      notice.value = `saved ${countFrames(sent.frames)} frames to data/portrait-framing.json`;
    } catch (err) {
      notice.value = err instanceof Error ? err.message : "failed to save settings";
    } finally {
      saving.value = false;
    }
  };

  const maxWidth = computed(() => {
    const active = current.value;
    return active ? maxFrameWidth(active.artifact, aspect.value) : 1;
  });

  return {
    query,
    status,
    error,
    notice,
    saving,
    avatarSize,
    aspect,
    headBand,
    current,
    dirty,
    rows,
    expressionCount,
    customizedCount,
    diskCount,
    maxWidth,
    sharedCount,
    sharedCharacters,
    hasClipboard,
    clipboardSource,
    select,
    load,
    setFrame,
    resetFrame,
    copyFrame,
    pasteFrame,
    nudge,
    zoomBy,
    applyToCharacter,
    applyToArtwork,
    importText,
    download,
    persist,
  };
});
