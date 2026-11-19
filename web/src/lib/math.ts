export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

export const clampStep = (value: number, min: number, max: number, step: number): number =>
  roundTo(clamp(value, min, max), step);
