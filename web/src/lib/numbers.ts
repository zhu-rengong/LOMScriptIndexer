const countFormat = new Intl.NumberFormat("en-US");
const signedFormat = new Intl.NumberFormat("en-US", { signDisplay: "exceptZero" });

export const formatCount = (value: unknown): string => {
  const number = Number(value);
  return countFormat.format(Number.isFinite(number) ? number : 0);
};

export const signedNumber = (value: number): string => signedFormat.format(value);
