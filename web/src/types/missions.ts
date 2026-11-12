export type MissionState = {
  start: string;
  next: string;
};

export type MissionRecord = {
  main: boolean;
  init: string;
  states: Record<string, MissionState>;
};

export type MissionPack = {
  schema?: number;
  missions?: Record<string, MissionRecord>;
};
