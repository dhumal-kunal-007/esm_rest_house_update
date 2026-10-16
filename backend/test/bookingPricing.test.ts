import assert from "node:assert/strict";
import test from "node:test";

import {
  BookingPricingInputError,
  calculateBookingPricing,
  guestTypeForDormitoryRelationship,
  isGuestType,
  roomRateColumnForGuestType,
  resolveDormitoryGuestType,
} from "../src/services/bookingPricing.js";

test("selects an independent configured room rate for each guest type", () => {
  assert.equal(roomRateColumnForGuestType("CIVILIAN"), "civilian_room_rate");
  assert.equal(roomRateColumnForGuestType("ESM"), "esm_room_rate");
  assert.equal(roomRateColumnForGuestType("SERVING"), "serving_room_rate");
});

test("uses the booking guest type for SELF and civilian rate for other dormitory relationships", () => {
  assert.equal(guestTypeForDormitoryRelationship("SELF", "ESM"), "ESM");
  assert.equal(guestTypeForDormitoryRelationship("self", "SERVING"), "SERVING");
  assert.equal(guestTypeForDormitoryRelationship("SON", "ESM"), "CIVILIAN");
});

test("uses each explicitly selected dormitory guest type regardless of relationship", () => {
  assert.equal(resolveDormitoryGuestType("ESM", "WIFE", "CIVILIAN"), "ESM");
  assert.equal(resolveDormitoryGuestType("SERVING", "SON", "ESM"), "SERVING");
  assert.equal(resolveDormitoryGuestType("CIVILIAN", "SELF", "ESM"), "CIVILIAN");
  assert.equal(resolveDormitoryGuestType(null, "WIFE", "ESM"), "CIVILIAN");
});

test("prices a mixed dormitory assignment with each occupant's selected rate", () => {
  const rateCard = {
    esm_room_rate: 80,
    serving_room_rate: 100,
    civilian_room_rate: 150,
  };
  const guestTypes = [
    resolveDormitoryGuestType("ESM", "WIFE", "CIVILIAN"),
    resolveDormitoryGuestType("SERVING", "SON", "ESM"),
    resolveDormitoryGuestType("CIVILIAN", "SELF", "ESM"),
  ];
  const rates = guestTypes.map(
    (type) => rateCard[roomRateColumnForGuestType(type)]
  );

  assert.deepEqual(rates, [80, 100, 150]);
  const pricing = calculateBookingPricing({
    guestType: "ESM",
    accommodationCategory: "DORMITORY",
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-02",
    roomCount: rates.length,
    unitRates: rates,
  });
  assert.equal(pricing.accommodationAmount, 330);
});

test("recognizes only supported guest types, leaving missing choices invalid", () => {
  assert.equal(isGuestType("ESM"), true);
  assert.equal(isGuestType("SERVING"), true);
  assert.equal(isGuestType("CIVILIAN"), true);
  assert.equal(isGuestType(undefined), false);
  assert.equal(isGuestType("OTHER"), false);
});

test("calculates room rates from guest type and duration", () => {
  const pricing = calculateBookingPricing({
    guestType: "ESM",
    accommodationCategory: "AC",
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-04",
    roomCount: 2,
    unitRates: [500, 500],
  });

  assert.equal(pricing.accommodationDays, 3);
  assert.equal(pricing.accommodationRate, 500);
  assert.equal(pricing.accommodationAmount, 3000);
  assert.equal(pricing.totalAmount, 3000);
});

test("charges one day for a same-day check-in and check-out", () => {
  const pricing = calculateBookingPricing({
    guestType: "ESM",
    accommodationCategory: "AC",
    checkInDate: "2026-10-12",
    checkOutDate: "2026-10-12",
    roomCount: 1,
    unitRates: [500],
  });

  assert.equal(pricing.accommodationDays, 1);
  assert.equal(pricing.accommodationAmount, 500);
});

test("charges a room rate once for multiple occupants using beds in one room", () => {
  for (const guestType of ["SERVING", "CIVILIAN"] as const) {
    const pricing = calculateBookingPricing({
      guestType,
      accommodationCategory: "DORMITORY",
      checkInDate: "2026-10-01",
      checkOutDate: "2026-10-02",
      roomCount: 1,
      unitRates: [100],
    });

    assert.equal(pricing.accommodationRate, 100);
    assert.equal(pricing.totalAmount, 100);
  }
});

test("rejects a check-out date before check-in", () => {
  assert.throws(
    () =>
      calculateBookingPricing({
        guestType: "ESM",
        accommodationCategory: "AC",
        checkInDate: "2026-10-12",
        checkOutDate: "2026-10-11",
        roomCount: 1,
        unitRates: [500],
      }),
    BookingPricingInputError
  );
});

test("calculates dormitory totals from mixed per-bed rates", () => {
  const pricing = calculateBookingPricing({
    guestType: "ESM",
    accommodationCategory: "DORMITORY",
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-04",
    roomCount: 2,
    unitRates: [70, 35],
  });

  assert.equal(pricing.accommodationDays, 3);
  assert.equal(pricing.accommodationRate, 52.5);
  assert.equal(pricing.accommodationAmount, 315);
});

test("rejects invalid dates and zero accommodation units", () => {
  assert.throws(
    () =>
      calculateBookingPricing({
        guestType: "ESM",
        accommodationCategory: "NON_AC",
        checkInDate: "2026-02-30",
        checkOutDate: "2026-03-02",
        roomCount: 1,
        unitRates: [100],
      }),
    BookingPricingInputError
  );

  assert.throws(
    () =>
      calculateBookingPricing({
        guestType: "ESM",
        accommodationCategory: "HALL",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-02",
        roomCount: 0,
        unitRates: [],
      }),
    BookingPricingInputError
  );
});

test("uses configured per-room rates and refuses incomplete rate cards", () => {
  const pricing = calculateBookingPricing({
    guestType: "ESM",
    accommodationCategory: "AC",
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-03",
    roomCount: 2,
    unitRates: [100, 250],
  });

  assert.equal(pricing.accommodationRate, 175);
  assert.equal(pricing.accommodationAmount, 700);

  assert.throws(
    () =>
      calculateBookingPricing({
        guestType: "ESM",
        accommodationCategory: "AC",
        checkInDate: "2026-10-01",
        checkOutDate: "2026-10-02",
        roomCount: 1,
        unitRates: [Number.NaN],
      }),
    BookingPricingInputError
  );
});
