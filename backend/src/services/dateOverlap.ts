type DateValue = string | Date;

const toDateOnly = (value: DateValue): string => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid date value.");
    }

    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const dateOnly = value.slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ||
    Number.isNaN(Date.parse(`${dateOnly}T00:00:00.000Z`)) ||
    !new Date(`${dateOnly}T00:00:00.000Z`)
      .toISOString()
      .startsWith(dateOnly)
  ) {
    throw new Error("Invalid date value.");
  }

  return dateOnly;
};

const addOneDay = (value: DateValue): string => {
  const [year, month, day] = toDateOnly(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
};

export const datesOverlap = (
  existingCheckIn: DateValue,
  existingCheckOut: DateValue,
  requestedCheckIn: DateValue,
  requestedCheckOut: DateValue
): boolean => {
  const existingStart = toDateOnly(existingCheckIn);
  const requestedStart = toDateOnly(requestedCheckIn);
  const existingEndValue = toDateOnly(existingCheckOut);
  const requestedEndValue = toDateOnly(requestedCheckOut);
  const existingEnd =
    existingEndValue <= existingStart
      ? addOneDay(existingStart)
      : existingEndValue;
  const requestedEnd =
    requestedEndValue <= requestedStart
      ? addOneDay(requestedStart)
      : requestedEndValue;

  return existingStart < requestedEnd && existingEnd > requestedStart;
};
