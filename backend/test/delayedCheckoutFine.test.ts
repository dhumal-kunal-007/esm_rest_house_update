import assert from "node:assert/strict";
import test from "node:test";
import { calculateDelayedCheckoutFine } from "../src/services/delayedCheckoutFine.js";

const expectedCheckout = "2026-10-23T13:00:00+05:30";

test("does not charge during the 20-minute grace period", () => {
  assert.deepEqual(
    calculateDelayedCheckoutFine(
      expectedCheckout,
      "2026-10-23T13:20:00+05:30",
      100
    ),
    { billableHours: 0, amount: 0 }
  );
});

test("charges one full hour when checkout is one minute beyond grace", () => {
  assert.deepEqual(
    calculateDelayedCheckoutFine(
      expectedCheckout,
      "2026-10-23T13:21:00+05:30",
      100
    ),
    { billableHours: 1, amount: 100 }
  );
});

test("rounds each started hour up after grace", () => {
  assert.deepEqual(
    calculateDelayedCheckoutFine(
      expectedCheckout,
      "2026-10-23T14:21:00+05:30",
      125.5
    ),
    { billableHours: 2, amount: 251 }
  );
});

test("does not charge for checkout before the expected time", () => {
  assert.deepEqual(
    calculateDelayedCheckoutFine(
      expectedCheckout,
      "2026-10-23T12:00:00+05:30",
      100
    ),
    { billableHours: 0, amount: 0 }
  );
});
