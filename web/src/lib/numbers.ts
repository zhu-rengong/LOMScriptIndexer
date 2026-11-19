const countFormat = new Intl.NumberFormat("en-US");

export const formatCount = (value: unknown): string => {
  const number = Number(value);
  return countFormat.format(Number.isFinite(number) ? number : 0);
};

export const signedNumber = (value: number): string =>
  new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" }).format(value);
