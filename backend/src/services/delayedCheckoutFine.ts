export interface DelayedCheckoutFine {
  billableHours: number;
  amount: number;
}

const toValidDate = (value: Date | string, field: string): Date => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${field} timestamp for delayed check-out.`);
  }
  return date;
};

export const calculateDelayedCheckoutFine = (
  expectedCheckoutAt: Date | string,
  actualCheckoutAt: Date | string,
  hourlyRate: number,
  graceMinutes = 20
): DelayedCheckoutFine => {
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error("Invalid delayed check-out hourly rate.");
  }
  if (!Number.isSafeInteger(graceMinutes) || graceMinutes < 0) {
    throw new Error("Invalid delayed check-out grace period.");
  }

  const expected = toValidDate(expectedCheckoutAt, "expected check-out");
  const actual = toValidDate(actualCheckoutAt, "actual check-out");
  const minutesLate =
    (actual.getTime() - expected.getTime()) / 60_000;
  const billableHours =
    minutesLate <= graceMinutes
      ? 0
      : Math.ceil((minutesLate - graceMinutes) / 60);

  return {
    billableHours,
    amount: Math.round(billableHours * hourlyRate * 100) / 100,
  };
};
