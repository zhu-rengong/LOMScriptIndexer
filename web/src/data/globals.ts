import type { CheckpointModel } from "../types/condition";
import type { RawGraph } from "../types/graph";
import type { MissionPack } from "../types/missions";
import type { TextPack, WordCountPack } from "../types/text";

export const readRawGraph = (): RawGraph | undefined => window.SR_DATA;

export const readTextPacks = (): Record<string, TextPack> => window.SR_TEXT || {};

export const readCheckpointModels = (): Record<string, CheckpointModel> =>
  (window.SR_CHECKPOINTS || {}) as Record<string, CheckpointModel>;

export const readVarReads = (): Record<string, unknown> => window.SR_VARREADS || {};

export const readWordCountPack = (): WordCountPack => (window.SR_WORDCOUNT || {}) as WordCountPack;

export const readMissions = (): MissionPack => (window.SR_MISSIONS || {}) as MissionPack;
