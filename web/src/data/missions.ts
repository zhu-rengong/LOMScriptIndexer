import type { MissionPack, MissionRecord, MissionState } from "../types/missions";
import { readMissions } from "./globals";

export type MissionLookup = { mission: string; state: MissionState };

const pack: MissionPack = readMissions();
const records: Record<string, MissionRecord> = pack.missions || {};

const stateIndex = new Map<string, MissionLookup>();

for (const mission of Object.keys(records)) {
  const record = records[mission];
  const states = record.states || {};
  for (const stateKey of Object.keys(states)) {
    stateIndex.set(stateKey, { mission, state: states[stateKey] });
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

const startOf = (stateKey: string): string => missionOfState(stateKey)?.state.start || "";

export const missions = { isMain, missionIdOf, missionOfState, recordOf, startOf };
