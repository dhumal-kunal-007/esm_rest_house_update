import assert from "node:assert/strict";
import test from "node:test";
import { isRoomGenderAllowed } from "../src/services/roomGenderRestriction.js";

test("ANY room restriction allows either guest gender", () => {
  assert.equal(isRoomGenderAllowed("ANY", "MALE"), true);
  assert.equal(isRoomGenderAllowed("ANY", "FEMALE"), true);
});

test("gender-restricted rooms only allow matching guests", () => {
  assert.equal(isRoomGenderAllowed("MALE", "MALE"), true);
  assert.equal(isRoomGenderAllowed("FEMALE", "FEMALE"), true);
  assert.equal(isRoomGenderAllowed("MALE", "FEMALE"), false);
  assert.equal(isRoomGenderAllowed("FEMALE", "MALE"), false);
});

test("restriction and guest gender are normalized safely", () => {
  assert.equal(isRoomGenderAllowed(" female ", "Female"), true);
  assert.equal(isRoomGenderAllowed("MALE", null), false);
  assert.equal(isRoomGenderAllowed(null, "FEMALE"), true);
});
