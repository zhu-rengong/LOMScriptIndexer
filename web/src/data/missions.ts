import type { MissionPack, MissionRecord, MissionState, MissionTimeRule } from "../types/missions";
import { readDataset } from "./access";

type MissionLookup = { mission: string; state: MissionState };

const EMPTY_TIME: MissionTimeRule = {
  check: false,
  type: 0,
  specific: null,
  min: null,
  max: null,
  period: 0,
};

const normalizeState = (state: MissionState): MissionState => ({
  ...state,
  active: state.active !== false,
  position: Number(state.position) || 0,
  positionCode: state.positionCode || "",
  beforeMain: state.beforeMain === true,
  start: state.start || "",
  next: state.next || "",
  time: state.time || EMPTY_TIME,
  conditions: state.conditions || [],
  startDialogs: state.startDialogs || [],
  alertDialogs: state.alertDialogs || [],
  modifyFlagsTrue: state.modifyFlagsTrue || [],
  modifyFlagsFalse: state.modifyFlagsFalse || [],
});

let recordsCache: Record<string, MissionRecord> | null = null;
let stateCache: Map<string, MissionLookup> | null = null;

const records = (): Record<string, MissionRecord> => {
  if (!recordsCache) {
    const pack = readDataset().missions as unknown as MissionPack;
    recordsCache = pack.items || {};
  }
  return recordsCache;
};

const stateIndex = (): Map<string, MissionLookup> => {
  if (!stateCache) {
    const table = new Map<string, MissionLookup>();
    for (const mission of Object.keys(records())) {
      const states = records()[mission].states || {};
      for (const stateKey of Object.keys(states)) {
        table.set(stateKey, { mission, state: normalizeState(states[stateKey]) });
      }
    }
    stateCache = table;
  }
  return stateCache;
};

const normalizeId = (value: string): string => {
  const id = (value || "").trim();
  return id.toLowerCase() === "main" ? "main" : id;
};

const missionOfState = (stateKey: string): MissionLookup | null =>
  stateKey ? stateIndex().get(stateKey) || null : null;

const missionIdOf = (stateKey: string, extra: string): string => {
  const hit = missionOfState(stateKey);
  return hit ? hit.mission : normalizeId(extra);
};

const recordOf = (missionId: string): MissionRecord | null =>
  missionId ? records()[missionId] || null : null;

const isMain = (missionId: string): boolean => {
  const record = recordOf(missionId);
  return record ? record.main : missionId === "main";
};

const missionIds = (): string[] => Object.keys(records());

const stateKeys = (): string[] => Array.from(stateIndex().keys());

export const missions = { isMain, missionIdOf, missionOfState, recordOf, missionIds, stateKeys };
