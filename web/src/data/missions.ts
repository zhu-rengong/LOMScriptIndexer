import type {
  MissionPack,
  MissionRecord,
  MissionState,
  MissionTimeRule,
} from "../types/missions";
import { readMissions } from "./globals";
import { DATA_SCHEMA } from "./schema";

export type MissionLookup = { mission: string; state: MissionState };

const EMPTY_TIME: MissionTimeRule = {
  check: false,
  type: 0,
  specific: null,
  min: null,
  max: null,
  period: 0,
};

const pack: MissionPack = readMissions();
const records: Record<string, MissionRecord> =
  pack.schema === DATA_SCHEMA ? pack.missions || {} : {};

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

const stateIndex = new Map<string, MissionLookup>();

for (const mission of Object.keys(records)) {
  const states = records[mission].states || {};
  for (const stateKey of Object.keys(states)) {
    stateIndex.set(stateKey, { mission, state: normalizeState(states[stateKey]) });
  }
}

const normalizeId = (value: string): string => {
  const id = (value || "").trim();
  return id.toLowerCase() === "main" ? "main" : id;
};

const missionOfState = (stateKey: string): MissionLookup | null =>
  stateKey ? stateIndex.get(stateKey) || null : null;

const missionIdOf = (stateKey: string, extra: string): string => {
  const hit = missionOfState(stateKey);
  return hit ? hit.mission : normalizeId(extra);
};

const recordOf = (missionId: string): MissionRecord | null =>
  missionId ? records[missionId] || null : null;

const isMain = (missionId: string): boolean => {
  const record = recordOf(missionId);
  return record ? record.main : missionId === "main";
};

export const missions = { isMain, missionIdOf, missionOfState, recordOf };
