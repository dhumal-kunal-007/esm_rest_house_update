export type GuestType =
  | "ESM"
  | "SERVING"
  | "CIVILIAN";

export type AccommodationCategory =
  | "AC"
  | "NON_AC"
  | "DORMITORY"
  | "VIP"
  | "HALL";

export type RoomRateColumn =
  | "esm_room_rate"
  | "serving_room_rate"
  | "civilian_room_rate";

export const roomRateColumnForGuestType = (
  guestType: GuestType
): RoomRateColumn => {
  switch (guestType) {
    case "ESM":
      return "esm_room_rate";
    case "SERVING":
      return "serving_room_rate";
    case "CIVILIAN":
      return "civilian_room_rate";
  }
};

export const guestTypeForDormitoryRelationship = (
  relationship: string,
  bookingGuestType: GuestType
): GuestType =>
  relationship.trim().toUpperCase() === "SELF"
    ? bookingGuestType
    : "CIVILIAN";

export interface BookingPricingResult {
  guestType: GuestType;
  accommodationCategory: AccommodationCategory;
  accommodationRate: number;
  accommodationDays: number;
  accommodationAmount: number;
  additionalRetiredMembers: number;
  additionalRetiredAmount: number;
  additionalOtherRelations: number;
  additionalOtherRelationAmount: number;
  additionalMemberAmount: number;
  totalAmount: number;
}

export class BookingPricingInputError extends Error {}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const roundCurrency = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100) / 100;

const toUtcDate = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new BookingPricingInputError(
      "Booking dates must use YYYY-MM-DD format."
    );
  }

  const [, year, month, day] = match;
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day)
  );

  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new BookingPricingInputError(
      "Booking contains an invalid stay date."
    );
  }

  return timestamp;
};

export const calculateBookingPricing = (input: {
  guestType: GuestType;
  accommodationCategory: AccommodationCategory;
  checkInDate: string;
  checkOutDate: string;
  roomCount: number;
  unitRates: number[];
}): BookingPricingResult => {
  const checkIn = toUtcDate(input.checkInDate);
  const checkOut = toUtcDate(input.checkOutDate);
  const stayDays = Math.ceil(
    (checkOut - checkIn) / millisecondsPerDay
  );

  if (stayDays < 0) {
    throw new BookingPricingInputError(
      "Check-out cannot be before check-in to calculate a rate."
    );
  }
  const accommodationDays = Math.max(1, stayDays);

  const units = input.roomCount;

  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new BookingPricingInputError(
      "At least one room must be accepted."
    );
  }

  if (
    input.unitRates.length !== units ||
    input.unitRates.some(
      (rate) => !Number.isFinite(rate) || rate <= 0
    )
  ) {
    throw new BookingPricingInputError(
      "Every accepted room must have an ADMIN-configured rate."
    );
  }

  const unitRateTotal = input.unitRates.reduce(
    (total, rate) => total + rate,
    0
  );
  const accommodationRate = roundCurrency(unitRateTotal / units);
  const accommodationAmount = roundCurrency(
    unitRateTotal * accommodationDays
  );

  // Additional-member categories are not currently collected by the booking flow.
  const additionalRetiredMembers = 0;
  const additionalOtherRelations = 0;
  const additionalRetiredAmount = 0;
  const additionalOtherRelationAmount = 0;
  const additionalMemberAmount = 0;

  return {
    guestType: input.guestType,
    accommodationCategory: input.accommodationCategory,
    accommodationRate,
    accommodationDays,
    accommodationAmount,
    additionalRetiredMembers,
    additionalRetiredAmount,
    additionalOtherRelations,
    additionalOtherRelationAmount,
    additionalMemberAmount,
    totalAmount: roundCurrency(
      accommodationAmount + additionalMemberAmount
    ),
  };
};
