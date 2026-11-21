import { missions } from "../data/missions";
import { names } from "../data/names";
import { t } from "../i18n";

export const stateFacetValue = (stateKey: string): string => `state-${stateKey}`;

const missionNameOf = (missionId: string): string => {
  if (!missionId) return "";
  if (missions.isMain(missionId)) return t("missionMain");
  const note = names.label("mission", missionId);
  return note && note !== missionId ? note : missionId;
};

export const missionLabel = (missionId: string): string => {
  if (!missionId) return "";
  return missionNameOf(missionId);
};

export const missionStateLabel = (stateKey: string): string => {
  if (!stateKey) return "";
  const hit = missions.missionOfState(stateKey);
  const note = names.label("missionState", stateKey);
  const name = note && note !== stateKey ? note : "";
  if (!hit) return name || stateKey;
  const mission = missionLabel(hit.mission);
  if (!name) return mission;
  return `${mission} / ${name}`;
};

export const missionLabelTable = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const missionId of missions.missionIds()) out[missionId] = missionLabel(missionId);
  for (const stateKey of missions.stateKeys()) {
    out[stateFacetValue(stateKey)] = missionStateLabel(stateKey);
  }
  return out;
};
