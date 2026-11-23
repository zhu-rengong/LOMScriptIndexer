import type { MissionDocument } from "../types/generated";
import type { MissionRecord, MissionState, MissionTimeRule } from "../types/missions";
import { readDataset } from "./access";

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
let stateCache: Map<string, { mission: string; state: MissionState }> | null = null;

const records = (): Record<string, MissionRecord> => {
  if (recordsCache) return recordsCache;
  const pack: MissionDocument = readDataset().missions;
  const out: Record<string, MissionRecord> = {};
  for (const [id, record] of Object.entries(pack.items ?? {})) {
    const states: Record<string, MissionState> = {};
    for (const [key, state] of Object.entries(record.states ?? {})) {
      states[key] = normalizeState(state as MissionState);
    }
    out[id] = {
      main: record.main === true,
      init: record.init || "",
      desc: record.desc,
      states,
    };
  }
  recordsCache = out;
  return out;
};

const stateIndex = (): Map<string, { mission: string; state: MissionState }> => {
  if (stateCache) return stateCache;
  const table = new Map<string, { mission: string; state: MissionState }>();
  const all = records();
  for (const mission of Object.keys(all)) {
    const states = all[mission].states || {};
    for (const stateKey of Object.keys(states)) {
      table.set(stateKey, { mission, state: states[stateKey] });
    }
  }
  stateCache = table;
  return table;
};

const normalizeId = (value: string): string => {
  const id = (value || "").trim();
  return id.toLowerCase() === "main" ? "main" : id;
};

const missionOfState = (stateKey: string): { mission: string; state: MissionState } | null =>
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
