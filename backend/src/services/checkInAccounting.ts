export function resolveActualCheckInTimestamp(
  actualCheckInDate: string,
  actualCheckInTime = "13:00"
): string {
  if (!actualCheckInDate || typeof actualCheckInDate !== "string") {
    throw new Error("Actual check-in date is required.");
  }

  const trimmedDate = actualCheckInDate.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error("Invalid check-in date. Use YYYY-MM-DD.");
  }

  const trimmedTime = (actualCheckInTime ?? "13:00").trim() || "13:00";

  if (!/^\d{1,2}:\d{2}$/.test(trimmedTime)) {
    throw new Error("Invalid check-in time. Use HH:MM.");
  }

  const [hoursText, minutesText] = trimmedTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error("Invalid check-in time.");
  }

  const [yearText, monthText, dayText] = trimmedDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  const resolved = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, 0)
  );

  if (
    Number.isNaN(resolved.getTime()) ||
    resolved.getUTCFullYear() !== year ||
    resolved.getUTCMonth() !== month - 1 ||
    resolved.getUTCDate() !== day
  ) {
    throw new Error("Invalid check-in date.");
  }

  return resolved.toISOString();
}
