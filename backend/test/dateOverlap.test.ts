import assert from "node:assert/strict";
import test from "node:test";
import { datesOverlap } from "../src/services/dateOverlap.js";

test("date overlap accepts PostgreSQL Date objects", () => {
  const existingCheckIn = new Date(2026, 9, 12);
  const existingCheckOut = new Date(2026, 9, 15);

  assert.equal(
    datesOverlap(
      existingCheckIn,
      existingCheckOut,
      "2026-10-12",
      "2026-10-13"
    ),
    true
  );
});

test("date overlap treats checkout as the release date", () => {
  assert.equal(
    datesOverlap(
      "2026-10-12",
      "2026-10-15",
      "2026-10-15",
      "2026-10-16"
    ),
    false
  );
});

test("date overlap supports same-day stays and timestamp strings", () => {
  assert.equal(
    datesOverlap(
      "2026-10-12T00:00:00.000Z",
      "2026-10-12T00:00:00.000Z",
      "2026-10-12",
      "2026-10-13"
    ),
    true
  );
});

test("date overlap rejects invalid values explicitly", () => {
  assert.throws(
    () => datesOverlap("not-a-date", "2026-10-13", "2026-10-12", "2026-10-14"),
    /Invalid date value/
  );
});
