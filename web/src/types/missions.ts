import type { ConditionNode } from "./condition";

export type MissionTime = {
  year: number;
  month: number;
  stage: number;
  day?: number;
};

export type MissionTimeRule = {
  check: boolean;
  type: number;
  specific: MissionTime | null;
  min: MissionTime | null;
  max: MissionTime | null;
  period: number;
};

export type MissionCondition = {
  note: string;
  expr: ConditionNode;
};

export type MissionDialog = {
  portrait: string;
  key: string;
};

export type MissionFlagChange = {
  key: string;
  value: number;
  note: string;
};

export type MissionState = {
  active: boolean;
  position: number;
  positionCode: string;
  beforeMain: boolean;
  start: string;
  next: string;
  time: MissionTimeRule;
  conditions: MissionCondition[];
  startDialogs: MissionDialog[];
  alertDialogs: MissionDialog[];
  modifyFlagsTrue: MissionFlagChange[];
  modifyFlagsFalse: MissionFlagChange[];
};

export type MissionRecord = {
  main: boolean;
  init: string;
  desc?: string;
  states: Record<string, MissionState>;
};

export type MissionPack = {
  schema?: string;
  items?: Record<string, MissionRecord>;
};
