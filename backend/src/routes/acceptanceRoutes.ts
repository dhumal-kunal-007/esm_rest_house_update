import { Router, Request, Response } from "express";
import { pool } from "../config/db.js";
import { isGuestType } from "../services/bookingPricing.js";
import { hasCompleteAcceptedAccommodations } from "../services/bookingWorkflowProgress.js";
import { isRoomGenderAllowed } from "../services/roomGenderRestriction.js";

const router = Router();

const canManageBooking = async (
  bookingId: string,
  userId: string,
  role: string
): Promise<boolean> => {
  if (
    role === "ADMIN" ||
    role === "RECEPTIONIST"
  ) {
    return true;
  }

  const result = await pool.query(
    "SELECT 1 FROM bookings WHERE id = $1 AND created_by = $2",
    [bookingId, userId]
  );

  return (result.rowCount ?? 0) > 0;
};

/*
|--------------------------------------------------------------------------
| POST /api/acceptances
|--------------------------------------------------------------------------
| Creates or updates the guest's acceptance of the selected room / bed.
|
| IMPORTANT:
| This does NOT create an allotment.
| This does NOT lock the room.
|
| Supports both:
| bookingId / booking_id
| guestId / guest_id
| roomId / room_id
| bedId / bed_id
|--------------------------------------------------------------------------
*/

router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    /*
     * Accept both camelCase and snake_case field names.
     *
     * Frontend currently sends:
     * booking_id
     * guest_id
     * room_id
     * bed_id
     */

    const bookingId =
      req.body.booking_id ??
      req.body.bookingId;

    const guestId =
      req.body.guest_id ??
      req.body.guestId;

    const roomId =
      req.body.room_id ??
      req.body.roomId;

    const bedId =
      req.body.bed_id ??
      req.body.bedId ??
      null;

    const remarks =
      req.body.remarks ??
      null;
    const requestedGuestType = req.body.guest_type;

    if (
      requestedGuestType !== undefined &&
      requestedGuestType !== null &&
      !isGuestType(requestedGuestType)
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected guest type is invalid.",
      });
    }

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "Booking ID is required.",
      });
    }

    if (!guestId) {
      return res.status(400).json({
        success: false,
        message: "Guest ID is required.",
      });
    }

    if (!roomId) {
      return res.status(400).json({
        success: false,
        message: "Room ID is required.",
      });
    }

    await client.query("BEGIN");

    /*
     * ------------------------------------------------------------
     * 1. Verify booking
     * ------------------------------------------------------------
     */

    const bookingResult = await client.query(
      `
      SELECT
        id,
        booking_reference,
        number_of_guests,
        check_in_date,
        expected_check_out_date,
        booking_status,
        approval_status,
        acceptance_status,
        created_by
      FROM bookings
      WHERE id = $1
      FOR UPDATE
      `,
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Booking not found.",
      });
    }

    const booking = bookingResult.rows[0];

    if (
      !booking.check_in_date ||
      !booking.expected_check_out_date ||
      booking.expected_check_out_date < booking.check_in_date
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "The booking must have a check-out date on or after check-in before accommodation can be accepted.",
      });
    }

    if (
      !(await canManageBooking(
        bookingId,
        req.authUser!.id,
        req.authUser!.role
      ))
    ) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message:
          "Only the booking creator, a Receptionist, or an ADMIN can manage accommodation acceptance.",
      });
    }

    if (
      !["PENDING", "APPROVED"].includes(booking.approval_status) ||
      booking.booking_status !== "PENDING_APPROVAL"
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "Accommodation acceptance is closed because the booking has already advanced in the approval flow.",
      });
    }

    const paymentResult = await client.query(
      "SELECT 1 FROM payments WHERE booking_id = $1 LIMIT 1",
      [bookingId]
    );

    if ((paymentResult.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "Accommodation cannot be changed after a payment has been recorded.",
      });
    }

    const bookingAllotmentResult = await client.query(
      `
      SELECT 1
      FROM allotments
      WHERE booking_id = $1
        AND allotment_status = 'ALLOTTED'
      LIMIT 1
      `,
      [bookingId]
    );

    if ((bookingAllotmentResult.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "Accommodation cannot be changed after a room or bed has been physically allotted.",
      });
    }

    /*
     * ------------------------------------------------------------
     * 2. Verify guest belongs to this booking
     * ------------------------------------------------------------
     */

    const guestResult = await client.query(
      `
      SELECT
        bg.id,
        bg.booking_id,
        bg.guest_id,
        bg.is_primary_guest,
        g.guest_name,
        g.gender
      FROM booking_guests bg
      INNER JOIN guests g
        ON g.id = bg.guest_id
      WHERE bg.booking_id = $1
        AND bg.guest_id = $2
      `,
      [bookingId, guestId]
    );

    if (guestResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: "Guest does not belong to this booking.",
      });
    }

    const guest = guestResult.rows[0];

    /*
     * ------------------------------------------------------------
     * 3. Verify room exists
     * ------------------------------------------------------------
     */

    const roomResult = await client.query(
      `
      SELECT
        r.id,
        r.room_number,
        r.total_beds,
        r.room_status,
        r.is_under_maintenance,
        r.is_active,
        r.allowed_gender,
        r.is_bookable,
        r.gender_restriction,
        r.room_note,
        r.room_usage,
        rc.category_name,
        card.room_capacity,
        card.bed_capacity
      FROM rooms r
      LEFT JOIN room_categories rc
        ON rc.id = r.category_id
      LEFT JOIN room_rate_cards card
        ON card.room_id = r.id
      WHERE r.id = $1
      FOR UPDATE OF r
      `,
      [roomId]
    );

    if (roomResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Selected room was not found.",
      });
    }

    const room = roomResult.rows[0];
    const normalizedRoomCategory = String(room.category_name ?? "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    const guestType = isGuestType(requestedGuestType)
      ? requestedGuestType
      : null;

    if (
      normalizedRoomCategory === "DORMITORY" &&
      (!bedId || !guestType)
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message:
          "Select ESM, Serving, or Civilian for every guest assigned to a Dormitory bed.",
      });
    }

    if (!room.is_active) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "Selected room is inactive.",
      });
    }

    if (!room.is_bookable || room.room_usage !== "GUEST") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `${room.room_number} is reserved for staff/storage and is not bookable.`,
      });
    }

    if (!isRoomGenderAllowed(room.gender_restriction, guest.gender)) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `${room.room_number} is restricted to ${String(room.gender_restriction).toLowerCase()} guests.`,
      });
    }

    if (room.is_under_maintenance) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Selected room is under maintenance and unavailable.",
      });
    }

    if (
      room.allowed_gender &&
      String(guest.gender ?? "").trim().toUpperCase() !== room.allowed_gender
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: `Room ${room.room_number} is reserved for ${room.allowed_gender.toLowerCase()} guests only.`,
      });
    }

    const sameBookingSelection = await client.query(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE bed_id = $4::uuid
        )::INTEGER AS same_bed_guest_count,
        COUNT(*) FILTER (
          WHERE bed_id IS NULL
        )::INTEGER AS whole_room_guest_count,
        COUNT(*) FILTER (
          WHERE bed_id IS NOT NULL
        )::INTEGER AS bed_guest_count
      FROM booking_acceptances
      WHERE
        booking_id = $1
        AND room_id = $2
        AND acceptance_status = 'ACCEPTED'
        AND guest_id <> $3
      `,
      [bookingId, roomId, guestId, bedId]
    );

    const existingSelection =
      sameBookingSelection.rows[0];
    const configuredCapacities = [
      Number(room.total_beds),
      room.room_capacity === null
        ? null
        : Number(room.room_capacity),
      room.bed_capacity === null
        ? null
        : Number(room.bed_capacity),
    ].filter(
      (capacity): capacity is number =>
        capacity !== null && Number.isFinite(capacity)
    );
    const roomOccupantCapacity = Math.min(...configuredCapacities);

    if (
      bedId &&
      (
        Number(existingSelection.same_bed_guest_count) > 0 ||
        Number(existingSelection.whole_room_guest_count) > 0
      )
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "The selected bed is already assigned to another guest in this booking, or this booking already has a whole-room selection there.",
      });
    }

    if (
      bedId &&
      Number(existingSelection.bed_guest_count) >=
        roomOccupantCapacity
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "The selected room has reached its configured bed capacity.",
      });
    }

    if (bedId) {
      const overlappingBedOccupants = await client.query(
        `
        SELECT COUNT(DISTINCT ba.guest_id)::INTEGER AS bed_guest_count
        FROM booking_acceptances ba
        INNER JOIN bookings existing_booking
          ON existing_booking.id = ba.booking_id
        WHERE ba.acceptance_status = 'ACCEPTED'
          AND ba.room_id = $1
          AND ba.bed_id IS NOT NULL
          AND ba.guest_id <> $2
          AND existing_booking.check_in_date <
            GREATEST($4::DATE, $3::DATE + 1)
          AND GREATEST(
            existing_booking.expected_check_out_date,
            existing_booking.check_in_date + 1
          ) > $3::DATE
        `,
        [
          roomId,
          guestId,
          booking.check_in_date,
          booking.expected_check_out_date,
        ]
      );

      if (
        Number(overlappingBedOccupants.rows[0]?.bed_guest_count ?? 0) >=
        roomOccupantCapacity
      ) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "The selected room has reached its configured bed capacity for these dates.",
        });
      }
    }

    if (
      !bedId &&
      Number(existingSelection.bed_guest_count) > 0
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "A whole-room selection cannot be combined with individual bed selections for the same room in this booking.",
      });
    }

    if (
      !bedId &&
      Number(existingSelection.whole_room_guest_count) >=
        roomOccupantCapacity
    ) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "The selected room has no remaining guest capacity.",
      });
    }

    /*
     * ------------------------------------------------------------
     * 4. If a bed is selected, verify the bed.
     * ------------------------------------------------------------
     */

    if (bedId) {
      const bedResult = await client.query(
        `
        SELECT
          id,
          room_id,
          bed_number,
          bed_status,
          is_active
        FROM beds
        WHERE id = $1
          AND room_id = $2
        `,
        [bedId, roomId]
      );

      if (bedResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message:
            "Selected bed does not belong to the selected room.",
        });
      }

      const bed = bedResult.rows[0];

      if (!bed.is_active) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message: "Selected bed is inactive.",
        });
      }

      /*
       * Acceptance stage only checks availability.
       * It does NOT change the bed status.
       */

      if (
        !["AVAILABLE", "BOOKED"].includes(
          String(bed.bed_status).toUpperCase()
        )
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message:
            "Selected bed is no longer available.",
        });
      }
    }

    /*
     * ------------------------------------------------------------
     * 5. Whole-room selection
     * ------------------------------------------------------------
     */

    if (!bedId) {
      const bedStatusResult =
        await client.query(
          `
          SELECT
            COUNT(*)::INTEGER AS total_beds,
            COUNT(*) FILTER (
              WHERE UPPER(bed_status) NOT IN ('AVAILABLE', 'BOOKED')
            )::INTEGER AS unavailable_beds
          FROM beds
          WHERE room_id = $1
            AND is_active = TRUE
          `,
          [roomId]
        );

      const totalBeds =
        bedStatusResult.rows[0]
          ?.total_beds ?? 0;

      const unavailableBeds =
        bedStatusResult.rows[0]
          ?.unavailable_beds ?? 0;

      if (
        totalBeds === 0 ||
        unavailableBeds > 0
      ) {
        await client.query("ROLLBACK");

        return res.status(409).json({
          success: false,
          message:
            "Selected room is not completely available.",
        });
      }
    }

    /*
     * ------------------------------------------------------------
     * 6. Prevent conflicting accepted selections
     * ------------------------------------------------------------
     */

    const overlapResult =
      await client.query(
        `
        SELECT
          ba.id,
          ba.booking_id,
          ba.guest_id,
          ba.room_id,
          ba.bed_id
        FROM booking_acceptances ba
        INNER JOIN bookings existing_booking
          ON existing_booking.id = ba.booking_id
        WHERE ba.acceptance_status = 'ACCEPTED'
          AND ba.booking_id <> $1
          AND ba.room_id = $2
          AND existing_booking.check_in_date <
            GREATEST($4::DATE, $3::DATE + 1)
          AND GREATEST(
            existing_booking.expected_check_out_date,
            existing_booking.check_in_date + 1
          ) > $3::DATE
          AND (
            $5::uuid IS NULL
            OR ba.bed_id IS NULL
            OR ba.bed_id = $5
          )
        LIMIT 1
        `,
        [
          bookingId,
          roomId,
          booking.check_in_date,
          booking.expected_check_out_date,
          bedId,
        ]
      );

    if (overlapResult.rows.length > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message:
          "The selected room or bed is already accepted for an overlapping booking.",
      });
    }

    const activeAllotmentConflict = await client.query(
      `
      SELECT a.id
      FROM allotments a
      INNER JOIN bookings existing_booking
        ON existing_booking.id = a.booking_id
      WHERE
        a.room_id = $1
        AND a.allotment_status = 'ALLOTTED'
        AND existing_booking.check_in_date <
          GREATEST($3::DATE, $2::DATE + 1)
        AND GREATEST(
          existing_booking.expected_check_out_date,
          existing_booking.check_in_date + 1
        ) > $2::DATE
        AND (
          $4::uuid IS NULL
          OR a.bed_id IS NULL
          OR a.bed_id = $4
        )
      LIMIT 1
      `,
      [
        roomId,
        booking.check_in_date,
        booking.expected_check_out_date,
        bedId,
      ]
    );

    if ((activeAllotmentConflict.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "The selected room or bed is already physically allotted for an overlapping stay.",
      });
    }

    const priorAcceptanceResult = await client.query(
      `
      SELECT room_id, bed_id, guest_type
      FROM booking_acceptances
      WHERE booking_id = $1
        AND guest_id = $2
        AND acceptance_status = 'ACCEPTED'
      LIMIT 1
      `,
      [bookingId, guestId]
    );
    const priorAcceptance = priorAcceptanceResult.rows[0];
    const selectionChanged =
      !priorAcceptance ||
      String(priorAcceptance.room_id) !== String(roomId) ||
      (priorAcceptance.bed_id ? String(priorAcceptance.bed_id) : null) !==
        (bedId ? String(bedId) : null) ||
      (priorAcceptance.guest_type ?? null) !== guestType;
    const approvalMustReset =
      booking.approval_status === "APPROVED" && selectionChanged;
    const shouldRestartPricingWorkflow =
      booking.approval_status !== "APPROVED" || approvalMustReset;

    if (approvalMustReset) {
      await client.query(
        `
        UPDATE bookings
        SET approval_status = 'PENDING',
            acceptance_status = 'PENDING',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [bookingId]
      );
      await client.query(
        `
        UPDATE booking_approvals
        SET approval_status = 'PENDING',
            approved_at = NULL,
            remarks = CONCAT(
              COALESCE(remarks, ''),
              CASE
                WHEN COALESCE(remarks, '') = '' THEN ''
                ELSE ' | '
              END,
              'Re-approval required after accommodation changes.'
            )
        WHERE booking_id = $1
          AND approval_status = 'APPROVED'
        `,
        [bookingId]
      );
    }

    /*
     * ------------------------------------------------------------
     * 7. Create / update acceptance
     * ------------------------------------------------------------
     */

    const acceptanceResult =
      await client.query(
        `
        INSERT INTO booking_acceptances (
          booking_id,
          guest_id,
          room_id,
          bed_id,
          guest_type,
          acceptance_status,
          accepted_at,
          remarks
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'ACCEPTED',
          CURRENT_TIMESTAMP,
          $6
        )
        ON CONFLICT (booking_id, guest_id)
        DO UPDATE SET
          room_id = EXCLUDED.room_id,
          bed_id = EXCLUDED.bed_id,
          guest_type = EXCLUDED.guest_type,
          acceptance_status = 'ACCEPTED',
          accepted_at = CURRENT_TIMESTAMP,
          remarks = EXCLUDED.remarks
        RETURNING
          id,
          booking_id,
          guest_id,
          room_id,
          bed_id,
          guest_type,
          acceptance_status,
          accepted_at,
          remarks,
          created_at
        `,
        [
          bookingId,
          guestId,
          roomId,
          bedId,
          guestType,
          remarks,
        ]
      );

    /*
     * ------------------------------------------------------------
     * 8. Update booking acceptance status
     * ------------------------------------------------------------
     */

    const acceptanceSummary =
      await client.query(
        `
        SELECT
          COUNT(*) FILTER (
            WHERE acceptance_status = 'ACCEPTED'
          )::INTEGER AS accepted_guests,
          COUNT(*) FILTER (
            WHERE acceptance_status = 'REJECTED'
          )::INTEGER AS rejected_guests
        FROM booking_acceptances
        WHERE booking_id = $1
        `,
        [bookingId]
      );

    const acceptedGuests =
      acceptanceSummary.rows[0]
        ?.accepted_guests ?? 0;

    const rejectedGuests =
      acceptanceSummary.rows[0]
        ?.rejected_guests ?? 0;

    let bookingAcceptanceStatus =
      "PENDING";

    if (hasCompleteAcceptedAccommodations(
      Number(acceptedGuests),
      Number(booking.number_of_guests)
    )) {
      bookingAcceptanceStatus =
        "ACCEPTED";
    } else if (
      rejectedGuests > 0
    ) {
      bookingAcceptanceStatus =
        "REJECTED";
    }

    await client.query(
      `
      UPDATE bookings
      SET
        acceptance_status = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [
        bookingId,
        bookingAcceptanceStatus,
      ]
    );

    if (shouldRestartPricingWorkflow) {
      await client.query(
        "DELETE FROM booking_pricing WHERE booking_id = $1",
        [bookingId]
      );

      await client.query(
        `
        INSERT INTO booking_workflow_progress (
          booking_id, current_step, updated_by, updated_at
        )
        VALUES (
          $1,
          CASE
            WHEN $3 = $4 THEN 'GUEST_TYPE'
            ELSE 'AVAILABILITY'
          END,
          $2,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (booking_id)
        DO UPDATE SET
          current_step = EXCLUDED.current_step,
          progress_data =
            booking_workflow_progress.progress_data - 'guest_type',
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [
          bookingId,
          req.authUser!.id,
          acceptedGuests,
          Number(booking.number_of_guests),
        ]
      );
    }

    await client.query("COMMIT");

    return res.status(201).json({
      success: true,

      message:
        "Room / bed selection accepted successfully.",

      acceptance:
        acceptanceResult.rows[0],

      booking: {
        id:
          booking.id,

        booking_reference:
          booking.booking_reference,

        acceptance_status:
          bookingAcceptanceStatus,

        approval_status:
          approvalMustReset ? "PENDING" : booking.approval_status,
      },

      guest: {
        id:
          guest.guest_id,

        name:
          guest.guest_name,
      },

      room: {
        id:
          room.id,

        room_number:
          room.room_number,

        category_name:
          room.category_name,
      },

      selection: {
        room_id:
          roomId,

        bed_id:
          bedId,
      },
    });

  } catch (error) {

    await client.query(
      "ROLLBACK"
    );

    console.error(
      "Acceptance creation error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to save room / bed acceptance.",

      error:
        error instanceof Error
          ? error.message
          : "Unknown error",
    });

  } finally {

    client.release();

  }
});

/*
|--------------------------------------------------------------------------
| GET /api/acceptances/booking/:bookingId
|--------------------------------------------------------------------------
*/

router.get(
  "/booking/:bookingId",
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const bookingId =
        String(req.params.bookingId);

      if (
        !(await canManageBooking(
          bookingId,
          req.authUser!.id,
          req.authUser!.role
        ))
      ) {
        return res.status(403).json({
          success: false,
          message:
            "You are not allowed to view this booking's accommodation acceptance.",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            ba.id,
            ba.booking_id,
            ba.guest_id,
            g.guest_name,
            ba.room_id,
            r.room_number,
            rc.category_name,
            ba.bed_id,
            b.bed_number,
            ba.acceptance_status,
            ba.accepted_at,
            ba.remarks,
            ba.created_at
          FROM booking_acceptances ba
          INNER JOIN guests g
            ON g.id = ba.guest_id
          LEFT JOIN rooms r
            ON r.id = ba.room_id
          LEFT JOIN room_categories rc
            ON rc.id = r.category_id
          LEFT JOIN beds b
            ON b.id = ba.bed_id
          WHERE ba.booking_id = $1
          ORDER BY
            g.guest_name,
            r.room_number,
            b.bed_number
          `,
          [bookingId]
        );

      return res.json({
        success: true,

        acceptances:
          result.rows,
      });

    } catch (error) {

      console.error(
        "Acceptance fetch error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to load booking acceptance.",
      });

    }

  }
);

/*
|--------------------------------------------------------------------------
| POST /api/acceptances/:acceptanceId/reject
|--------------------------------------------------------------------------
*/

router.post(
  "/:acceptanceId/reject",
  async (
    req: Request,
    res: Response
  ) => {

    try {

      const {
        acceptanceId,
      } = req.params;

      const {
        remarks = null,
      } = req.body;

      if (
        req.authUser?.role !== "ADMIN" &&
        req.authUser?.role !== "RECEPTIONIST"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only a Receptionist or ADMIN can reject an accommodation acceptance.",
        });
      }

      const bookingResult = await pool.query(
        `
        SELECT
          ba.booking_id,
          b.approval_status
        FROM booking_acceptances ba
        INNER JOIN bookings b
          ON b.id = ba.booking_id
        WHERE ba.id = $1
        `,
        [acceptanceId]
      );

      if ((bookingResult.rowCount ?? 0) === 0) {
        return res.status(404).json({
          success: false,
          message: "Acceptance record not found.",
        });
      }

      if (bookingResult.rows[0].approval_status !== "PENDING") {
        return res.status(409).json({
          success: false,
          message:
            "Accommodation acceptance cannot be rejected after approval has been decided.",
        });
      }

      const paymentResult = await pool.query(
        "SELECT 1 FROM payments WHERE booking_id = $1 LIMIT 1",
        [bookingResult.rows[0].booking_id]
      );

      if ((paymentResult.rowCount ?? 0) > 0) {
        return res.status(409).json({
          success: false,
          message:
            "Accommodation acceptance cannot be changed after payment.",
        });
      }

      const result =
        await pool.query(
          `
          UPDATE booking_acceptances
          SET
            acceptance_status = 'REJECTED',
            accepted_at = NULL,
            remarks = $2
          WHERE id = $1
          RETURNING
            id,
            booking_id,
            guest_id,
            room_id,
            bed_id,
            acceptance_status,
            accepted_at,
            remarks
          `,
          [
            acceptanceId,
            remarks,
          ]
        );

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          success: false,

          message:
            "Acceptance record not found.",
        });

      }

      const acceptance =
        result.rows[0];

      await pool.query(
        "DELETE FROM booking_pricing WHERE booking_id = $1",
        [acceptance.booking_id]
      );

      const summary =
        await pool.query(
          `
          SELECT
            COUNT(*)::INTEGER AS total_guests,
            COUNT(*) FILTER (
              WHERE acceptance_status = 'ACCEPTED'
            )::INTEGER AS accepted_guests,
            COUNT(*) FILTER (
              WHERE acceptance_status = 'REJECTED'
            )::INTEGER AS rejected_guests
          FROM booking_acceptances
          WHERE booking_id = $1
          `,
          [
            acceptance.booking_id,
          ]
        );

      const totalGuests =
        summary.rows[0]
          ?.total_guests ?? 0;

      const acceptedGuests =
        summary.rows[0]
          ?.accepted_guests ?? 0;

      const rejectedGuests =
        summary.rows[0]
          ?.rejected_guests ?? 0;

      let bookingAcceptanceStatus =
        "PENDING";

      if (
        totalGuests > 0 &&
        acceptedGuests ===
          totalGuests
      ) {

        bookingAcceptanceStatus =
          "ACCEPTED";

      } else if (
        rejectedGuests > 0
      ) {

        bookingAcceptanceStatus =
          "REJECTED";

      }

      await pool.query(
        `
        UPDATE bookings
        SET acceptance_status = $2
        WHERE id = $1
        `,
        [
          acceptance.booking_id,
          bookingAcceptanceStatus,
        ]
      );

      return res.json({
        success: true,

        message:
          "Acceptance rejected successfully.",

        acceptance,

        booking_acceptance_status:
          bookingAcceptanceStatus,
      });

    } catch (error) {

      console.error(
        "Acceptance rejection error:",
        error
      );

      return res.status(500).json({
        success: false,

        message:
          "Unable to reject acceptance.",
      });

    }

  }
);

export default router;