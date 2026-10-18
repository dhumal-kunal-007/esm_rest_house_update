import assert from "node:assert/strict";
import test from "node:test";
import { checkBedDateConflict } from "../src/services/bedDateConflict.js";

type AllotmentFixture = {
  room_id: string;
  bed_id: string | null;
  booking_id: string;
  allotment_status: string;
  booking_status: string;
  booking_reference: string;
  check_in_date: string;
  expected_check_out_date: string;
};

function createClient(
  roomId: string,
  allotments: AllotmentFixture[]
) {
  return {
    async query(sql: string, values?: any[]) {
      if (sql.includes("FOR UPDATE OF r")) {
        return { rows: [{ room_id: roomId }] };
      }

      assert.match(sql, /a\.room_id\s*=\s*\$3/);
      const [bedId, bookingId, requestedRoomId] = values ?? [];

      return {
        rows: allotments
          .filter(
            (allotment) =>
              allotment.room_id === requestedRoomId &&
              (allotment.bed_id === bedId ||
                allotment.bed_id === null) &&
              allotment.booking_id !== bookingId &&
              allotment.allotment_status === "ALLOTTED" &&
              !["CANCELLED", "REJECTED"].includes(
                allotment.booking_status
              )
          )
          .map(
            ({
              booking_reference,
              check_in_date,
              expected_check_out_date,
            }) => ({
              booking_reference,
              check_in_date,
              expected_check_out_date,
            })
          ),
      };
    },
  };
}

const stay = {
  check_in_date: "2026-10-15",
  expected_check_out_date: "2026-10-16",
};

test("a whole-room allotment in another room does not block a DM bed", async () => {
  const conflict = await checkBedDateConflict(
    createClient("dm-room", [
      {
        room_id: "nac-room",
        bed_id: null,
        booking_id: "existing-booking",
        allotment_status: "ALLOTTED",
        booking_status: "CONFIRMED",
        booking_reference: "ESM-2026-00004",
        ...stay,
      },
    ]),
    "dm-bed",
    "new-booking",
    "2026-10-15",
    "2026-10-16"
  );

  assert.deepEqual(conflict, { conflict: false });
});

test("a whole-room allotment in the same room blocks a DM bed", async () => {
  const conflict = await checkBedDateConflict(
    createClient("dm-room", [
      {
        room_id: "dm-room",
        bed_id: null,
        booking_id: "existing-booking",
        allotment_status: "ALLOTTED",
        booking_status: "CONFIRMED",
        booking_reference: "ESM-2026-00004",
        ...stay,
      },
    ]),
    "dm-bed",
    "new-booking",
    "2026-10-15",
    "2026-10-16"
  );

  assert.equal(conflict.conflict, true);
  assert.equal(conflict.bookingReference, "ESM-2026-00004");
});

test("an overlapping allotment of the same bed still blocks the bed", async () => {
  const conflict = await checkBedDateConflict(
    createClient("dm-room", [
      {
        room_id: "dm-room",
        bed_id: "dm-bed",
        booking_id: "existing-booking",
        allotment_status: "ALLOTTED",
        booking_status: "CONFIRMED",
        booking_reference: "ESM-2026-00004",
        ...stay,
      },
    ]),
    "dm-bed",
    "new-booking",
    "2026-10-15",
    "2026-10-16"
  );

  assert.equal(conflict.conflict, true);
  assert.equal(conflict.bookingReference, "ESM-2026-00004");
});
