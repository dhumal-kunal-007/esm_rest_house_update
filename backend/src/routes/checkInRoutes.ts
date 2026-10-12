import { Router, Request, Response } from "express";
import { pool } from "../config/db.js";
import { resolveActualCheckInTimestamp } from "../services/checkInAccounting.js";
import {
  BOOKING_CHECK_IN_TIME,
  BOOKING_TIME_ZONE,
} from "../services/bookingSchedule.js";

const router = Router();

async function getSuccessfulPaymentStatus(
  client: any
): Promise<string> {
  const result = await client.query(
    `
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE
      conname = 'payments_status_check'
      AND conrelid = 'payments'::regclass
    LIMIT 1
    `
  );

  if (result.rowCount === 0) {
    throw new Error(
      "payments_status_check constraint was not found."
    );
  }

  const definition = String(result.rows[0].definition);
  const allowedStatuses = (definition.match(/'([^']+)'/g) || [])
    .map((value: string) => value.substring(1, value.length - 1));
  const successfulStatus = [
    "SUCCESS",
    "COMPLETED",
    "PAID",
    "RECEIVED",
  ].find((status) => allowedStatuses.includes(status));

  if (!successfulStatus) {
    throw new Error(
      `No successful payment status was found in payments_status_check. Allowed statuses: ${allowedStatuses.join(", ")}`
    );
  }

  return successfulStatus;
}

/* =========================================
   GET ELIGIBLE GUESTS FOR CHECK-IN

   Every accommodation type requires approval,
   acceptance, a successful payment and an invoice.

   Already checked-in guests are NOT returned.
========================================= */

router.get(
  "/eligible",
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {

    try {

      const successfulPaymentStatus =
        await getSuccessfulPaymentStatus(pool);

      const result = await pool.query(`
        SELECT
          a.id AS allotment_id,
          a.booking_id,
          b.booking_reference,
          sm.full_name AS booking_person_name,

          a.guest_id,
          g.guest_name,
          g.mobile_number,

          a.room_id,
          r.room_number,

          a.bed_id,
          bd.bed_number,

          b.check_in_date,
          b.expected_check_out_date,

          (
            CURRENT_TIMESTAMP AT TIME ZONE $2::text
          ) >= (b.check_in_date + $3::time) AS check_in_available,

          b.approval_status,
          b.acceptance_status,
          a.allotment_status,

          CASE
            WHEN ci.id IS NOT NULL
              THEN 'CHECKED_IN'
            ELSE 'NOT_CHECKED_IN'
          END AS check_in_status

        FROM allotments a

        INNER JOIN bookings b
          ON b.id = a.booking_id

        LEFT JOIN booking_service_members sm
          ON sm.booking_id = b.id

        INNER JOIN guests g
          ON g.id = a.guest_id

        INNER JOIN rooms r
          ON r.id = a.room_id

        LEFT JOIN beds bd
          ON bd.id = a.bed_id

        LEFT JOIN check_ins ci
          ON ci.allotment_id = a.id

        WHERE
          a.allotment_status = 'ALLOTTED'

          /*
           * IMPORTANT:
           *
           * Already checked-in guests must NOT
           * appear in the eligible list again.
           */
          AND ci.id IS NULL
          AND b.approval_status = 'APPROVED'
          AND b.acceptance_status = 'ACCEPTED'
          AND EXISTS (
            SELECT 1
            FROM payments p
            INNER JOIN booking_invoices bi
              ON bi.payment_id = p.id
             AND bi.booking_id = p.booking_id
            WHERE p.booking_id = b.id
              AND p.payment_status = $1
          )

        ORDER BY
          b.check_in_date ASC,
          r.room_number ASC,
          bd.bed_number ASC,
          g.guest_name ASC
      `, [
        successfulPaymentStatus,
        BOOKING_TIME_ZONE,
        BOOKING_CHECK_IN_TIME,
      ]);

      res.json({
        guests: result.rows,
      });

    } catch (error) {

      console.error(
        "GET /api/check-ins/eligible error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to load guests eligible for check-in.",
      });

    }
  }
);

router.post(
  "/room",
  async (req: Request, res: Response): Promise<void> => {
    const { booking_id, room_id, checked_in_by, remarks } = req.body;
    if (!booking_id || !room_id || !checked_in_by) {
      res.status(400).json({
        message: "Booking, room and checking-in user are required.",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const allotmentsResult = await client.query(
        `
        SELECT a.id, a.guest_id, a.room_id
        FROM allotments a
        WHERE a.booking_id = $1
          AND a.room_id = $2
          AND a.bed_id IS NULL
          AND a.allotment_status = 'ALLOTTED'
        ORDER BY a.guest_id
        FOR UPDATE
        `,
        [booking_id, room_id]
      );
      if (allotmentsResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "No active room allotments were found." });
        return;
      }

      await client.query("SELECT id FROM rooms WHERE id = $1 FOR UPDATE", [room_id]);

      const bookingResult = await client.query(
        `
        SELECT id, booking_reference, approval_status, acceptance_status, check_in_date
        FROM bookings
        WHERE id = $1
        FOR UPDATE
        `,
        [booking_id]
      );
      if (bookingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "Booking was not found." });
        return;
      }
      const booking = bookingResult.rows[0];
      if (booking.approval_status !== "APPROVED" || booking.acceptance_status !== "ACCEPTED") {
        await client.query("ROLLBACK");
        res.status(403).json({
          message: "Room check-in requires an approved booking and accepted accommodation.",
          approval_status: booking.approval_status,
          acceptance_status: booking.acceptance_status,
        });
        return;
      }

      const paymentStatus = await getSuccessfulPaymentStatus(client);
      const paymentResult = await client.query(
        `
        SELECT 1
        FROM payments p
        INNER JOIN booking_invoices bi
          ON bi.payment_id = p.id AND bi.booking_id = p.booking_id
        WHERE p.booking_id = $1 AND p.payment_status = $2
        LIMIT 1
        `,
        [booking_id, paymentStatus]
      );
      if (paymentResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(403).json({ message: "Check-in requires a successful payment and its invoice." });
        return;
      }

      const turnoverResult = await client.query(
        `
        SELECT
          (CURRENT_TIMESTAMP AT TIME ZONE $2::text) >=
            ($1::date + $3::time) AS check_in_available,
          EXISTS (
            SELECT 1
            FROM check_ins ci
            INNER JOIN allotments pa ON pa.id = ci.allotment_id
            LEFT JOIN check_outs co ON co.allotment_id = pa.id
            WHERE pa.room_id = $4
              AND pa.booking_id <> $5
              AND pa.bed_id IS NULL
              AND pa.allotment_status = 'ALLOTTED'
              AND co.id IS NULL
          ) AS previous_guest_present,
          EXISTS (
            SELECT 1
            FROM housekeeping_tasks ht
            WHERE ht.room_id = $4
              AND ht.task_status <> 'CLEARED'
          ) AS housekeeping_incomplete
        `,
        [booking.check_in_date, BOOKING_TIME_ZONE, BOOKING_CHECK_IN_TIME, room_id, booking_id]
      );
      const turnover = turnoverResult.rows[0];
      if (!turnover.check_in_available) {
        await client.query("ROLLBACK");
        res.status(409).json({ message: `Check-in is available from ${BOOKING_CHECK_IN_TIME} on the scheduled arrival date.` });
        return;
      }
      if (turnover.previous_guest_present || turnover.housekeeping_incomplete) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: turnover.previous_guest_present
            ? "Check-in is blocked until the previous guest has checked out."
            : "Check-in is blocked until housekeeping has cleared the room.",
        });
        return;
      }

      const userResult = await client.query(
        "SELECT id FROM users WHERE id = $1 AND is_active = TRUE",
        [checked_in_by]
      );
      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(403).json({ message: "The checking-in user was not found or is inactive." });
        return;
      }

      const allotmentIds = allotmentsResult.rows.map((row: { id: string }) => row.id);
      const existingResult = await client.query(
        "SELECT allotment_id FROM check_ins WHERE allotment_id = ANY($1::uuid[])",
        [allotmentIds]
      );
      const existingIds = new Set(existingResult.rows.map((row: { allotment_id: string }) => row.allotment_id));
      const pendingAllotments = allotmentsResult.rows.filter(
        (row: { id: string }) => !existingIds.has(row.id)
      );
      if (pendingAllotments.length === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ message: "All guests assigned to this room are already checked in." });
        return;
      }

      const checkIns = [];
      for (const allotment of pendingAllotments) {
        const inserted = await client.query(
          `
          INSERT INTO check_ins (booking_id, guest_id, allotment_id, check_in_time, checked_in_by, remarks)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5)
          RETURNING id, booking_id, guest_id, allotment_id, check_in_time
          `,
          [booking_id, allotment.guest_id, allotment.id, checked_in_by, remarks ?? null]
        );
        checkIns.push(inserted.rows[0]);
      }

      await client.query(
        "UPDATE rooms SET room_status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [room_id]
      );

      const bookingGuestCounts = await client.query(
        `
        SELECT
          (SELECT COUNT(*)::INTEGER FROM booking_guests WHERE booking_id = $1) AS total_guests,
          (SELECT COUNT(*)::INTEGER FROM check_ins WHERE booking_id = $1) AS checked_in_guests
        `,
        [booking_id]
      );
      if (Number(bookingGuestCounts.rows[0].total_guests) > 0 &&
          Number(bookingGuestCounts.rows[0].checked_in_guests) >= Number(bookingGuestCounts.rows[0].total_guests)) {
        await client.query(
          "UPDATE bookings SET booking_status = 'CHECKED_IN', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [booking_id]
        );
      }

      await client.query("COMMIT");
      res.status(201).json({
        message: "All guests assigned to the room were checked in.",
        checkIns,
        checked_in_count: checkIns.length,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("POST /api/check-ins/room error:", error);
      res.status(500).json({ message: "Unable to complete room check-in." });
    } finally {
      client.release();
    }
  }
);

router.post(
  "/manual-room",
  async (req: Request, res: Response): Promise<void> => {
    if (req.authUser?.role !== "ADMIN" && req.authUser?.role !== "RECEPTIONIST") {
      res.status(403).json({ message: "Only administrators and receptionists can record a manual pre-checkin." });
      return;
    }

    const {
      booking_id,
      room_id,
      checked_in_by,
      actual_check_in_date,
      actual_check_in_time = "13:00",
      amount,
      payment_method = "CASH",
      remarks,
    } = req.body;
    if (!booking_id || !room_id || !checked_in_by || !actual_check_in_date) {
      res.status(400).json({ message: "Booking, room, user and actual check-in date are required." });
      return;
    }

    let actualCheckInTimestamp: string;
    try {
      actualCheckInTimestamp = resolveActualCheckInTimestamp(actual_check_in_date, actual_check_in_time);
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Invalid check-in date or time." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const allotmentsResult = await client.query(
        `
        SELECT a.id, a.guest_id
        FROM allotments a
        WHERE a.booking_id = $1 AND a.room_id = $2
          AND a.bed_id IS NULL AND a.allotment_status = 'ALLOTTED'
        ORDER BY a.guest_id
        FOR UPDATE
        `,
        [booking_id, room_id]
      );
      if (allotmentsResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "No active room allotments were found." });
        return;
      }
      await client.query("SELECT id FROM rooms WHERE id = $1 FOR UPDATE", [room_id]);

      const bookingResult = await client.query(
        "SELECT id, approval_status, acceptance_status FROM bookings WHERE id = $1 FOR UPDATE",
        [booking_id]
      );
      if (bookingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ message: "Booking was not found." });
        return;
      }
      const booking = bookingResult.rows[0];
      if (booking.approval_status !== "APPROVED" || booking.acceptance_status !== "ACCEPTED") {
        await client.query("ROLLBACK");
        res.status(403).json({ message: "Manual room check-in requires an approved booking and accepted accommodation." });
        return;
      }
      const userResult = await client.query(
        "SELECT id FROM users WHERE id = $1 AND is_active = TRUE",
        [checked_in_by]
      );
      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(403).json({ message: "The checking-in user was not found or is inactive." });
        return;
      }

      const allotmentIds = allotmentsResult.rows.map((row: { id: string }) => row.id);
      const existingResult = await client.query(
        "SELECT allotment_id FROM check_ins WHERE allotment_id = ANY($1::uuid[])",
        [allotmentIds]
      );
      const existingIds = new Set(existingResult.rows.map((row: { allotment_id: string }) => row.allotment_id));
      const pendingAllotments = allotmentsResult.rows.filter(
        (row: { id: string }) => !existingIds.has(row.id)
      );
      if (pendingAllotments.length === 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ message: "All guests assigned to this room are already checked in." });
        return;
      }

      const paymentStatus = await getSuccessfulPaymentStatus(client);
      const checkIns = [];
      for (const allotment of pendingAllotments) {
        const inserted = await client.query(
          `
          INSERT INTO check_ins (booking_id, guest_id, allotment_id, check_in_time, checked_in_by, remarks)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, booking_id, guest_id, allotment_id, check_in_time
          `,
          [
            booking_id,
            allotment.guest_id,
            allotment.id,
            actualCheckInTimestamp,
            checked_in_by,
            remarks ?? "Manual pre-checkin entry created by authorized staff.",
          ]
        );
        checkIns.push(inserted.rows[0]);
      }

      await client.query(
        "UPDATE rooms SET room_status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [room_id]
      );
      if (Number(amount) > 0) {
        await client.query(
          `
          INSERT INTO payments (
            booking_id, amount, payment_method, transaction_number, payment_date, payment_status, remarks, received_by
          )
          VALUES ($1, $2, $3, NULL, $4, $5, $6, $7)
          `,
          [
            booking_id,
            Number(amount),
            String(payment_method || "CASH").toUpperCase(),
            actual_check_in_date,
            paymentStatus,
            remarks ? String(remarks).trim() : "Manual pre-checkin entry recorded by authorized staff.",
            checked_in_by,
          ]
        );
      }

      const bookingGuestCounts = await client.query(
        `
        SELECT
          (SELECT COUNT(*)::INTEGER FROM booking_guests WHERE booking_id = $1) AS total_guests,
          (SELECT COUNT(*)::INTEGER FROM check_ins WHERE booking_id = $1) AS checked_in_guests
        `,
        [booking_id]
      );
      if (Number(bookingGuestCounts.rows[0].total_guests) > 0 &&
          Number(bookingGuestCounts.rows[0].checked_in_guests) >= Number(bookingGuestCounts.rows[0].total_guests)) {
        await client.query(
          "UPDATE bookings SET booking_status = 'CHECKED_IN', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [booking_id]
        );
      }
      await client.query("COMMIT");
      res.status(201).json({
        message: "Manual pre-checkin recorded for all guests assigned to the room.",
        checkIns,
        checked_in_count: checkIns.length,
        payment_created: Number(amount) > 0,
        actual_check_in_time: actualCheckInTimestamp,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("POST /api/check-ins/manual-room error:", error);
      res.status(500).json({ message: "Unable to record manual room pre-checkin." });
    } finally {
      client.release();
    }
  }
);


/* =========================================
   POST MANUAL PRE-CHECKIN
========================================= */

router.post(
  "/manual",
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    if (
      req.authUser?.role !== "ADMIN" &&
      req.authUser?.role !== "RECEPTIONIST"
    ) {
      res.status(403).json({
        message: "Only administrators and receptionists can record a manual pre-checkin.",
      });
      return;
    }

    const {
      allotment_id,
      booking_id,
      guest_id,
      room_id,
      bed_id = null,
      checked_in_by,
      actual_check_in_date,
      actual_check_in_time = "13:00",
      amount,
      payment_method = "CASH",
      remarks,
    } = req.body;

    if (!allotment_id) {
      res.status(400).json({
        message: "Allotment ID is required.",
      });
      return;
    }

    if (!booking_id) {
      res.status(400).json({
        message: "Booking ID is required.",
      });
      return;
    }

    if (!guest_id) {
      res.status(400).json({
        message: "Guest ID is required.",
      });
      return;
    }

    if (!room_id) {
      res.status(400).json({
        message: "Room ID is required.",
      });
      return;
    }

    if (!checked_in_by) {
      res.status(400).json({
        message: "Checked-in user ID is required.",
      });
      return;
    }

    if (!actual_check_in_date) {
      res.status(400).json({
        message: "Actual check-in date is required.",
      });
      return;
    }

    const requestedBedId = bed_id || null;
    const actualCheckInTimestamp = resolveActualCheckInTimestamp(
      actual_check_in_date,
      actual_check_in_time
    );

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const allotmentResult = await client.query(
        `
        SELECT
          a.id,
          a.booking_id,
          a.guest_id,
          a.room_id,
          a.bed_id,
          a.allotment_status,
          r.room_number
        FROM allotments a
        INNER JOIN rooms r ON r.id = a.room_id
        WHERE a.id = $1
        FOR UPDATE
        `,
        [allotment_id]
      );

      if (allotmentResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "The selected allotment was not found.",
        });
        return;
      }

      const allotment = allotmentResult.rows[0];

      if (allotment.allotment_status !== "ALLOTTED") {
        await client.query("ROLLBACK");
        res.status(400).json({
          message: "This allotment is no longer active.",
        });
        return;
      }

      if (
        allotment.booking_id !== booking_id ||
        allotment.guest_id !== guest_id ||
        allotment.room_id !== room_id ||
        allotment.bed_id !== requestedBedId
      ) {
        await client.query("ROLLBACK");
        res.status(400).json({
          message: "The manual check-in information does not match the active allotment.",
        });
        return;
      }

      const bookingResult = await client.query(
        `
        SELECT
          id,
          booking_reference,
          booking_status,
          approval_status,
          acceptance_status,
          check_in_date,
          expected_check_out_date
        FROM bookings
        WHERE id = $1
        FOR UPDATE
        `,
        [booking_id]
      );

      if (bookingResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "The booking associated with this allotment was not found.",
        });
        return;
      }

      const booking = bookingResult.rows[0];

      if (booking.approval_status !== "APPROVED") {
        await client.query("ROLLBACK");
        res.status(403).json({
          message: "Manual pre-checkin is not allowed until the booking is approved.",
          approval_status: booking.approval_status,
          booking_reference: booking.booking_reference,
        });
        return;
      }

      if (booking.acceptance_status !== "ACCEPTED") {
        await client.query("ROLLBACK");
        res.status(403).json({
          message: "Manual pre-checkin is not allowed until the guest accepts the assigned accommodation.",
          acceptance_status: booking.acceptance_status,
          booking_reference: booking.booking_reference,
        });
        return;
      }

      const existingCheckIn = await client.query(
        `
        SELECT id
        FROM check_ins
        WHERE allotment_id = $1
        LIMIT 1
        `,
        [allotment_id]
      );

      if (existingCheckIn.rows.length > 0) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "This guest has already been checked in.",
        });
        return;
      }

      const userResult = await client.query(
        `
        SELECT id, full_name, is_active
        FROM users
        WHERE id = $1
        `,
        [checked_in_by]
      );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          message: "The checking-in user was not found.",
        });
        return;
      }

      if (!userResult.rows[0].is_active) {
        await client.query("ROLLBACK");
        res.status(403).json({
          message: "The checking-in user is inactive.",
        });
        return;
      }

      const successfulPaymentStatus = await getSuccessfulPaymentStatus(client);

      const checkInResult = await client.query(
        `
        INSERT INTO check_ins (
          booking_id,
          guest_id,
          allotment_id,
          check_in_time,
          checked_in_by,
          remarks
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING
          id,
          booking_id,
          guest_id,
          allotment_id,
          check_in_time,
          checked_in_by,
          remarks
        `,
        [
          booking_id,
          guest_id,
          allotment_id,
          actualCheckInTimestamp,
          checked_in_by,
          remarks ?? "Manual pre-checkin entry created by authorized staff.",
        ]
      );

      if (allotment.bed_id !== null) {
        await client.query(
          `
          UPDATE beds
          SET bed_status = 'OCCUPIED'
          WHERE id = $1
          `,
          [allotment.bed_id]
        );
      }

      await client.query(
        `
        UPDATE rooms
        SET room_status = 'OCCUPIED', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [allotment.room_id]
      );

      const bookingGuestsResult = await client.query(
        `
        SELECT COUNT(*)::INTEGER AS total_guests
        FROM booking_guests
        WHERE booking_id = $1
        `,
        [booking_id]
      );

      const checkedInGuestsResult = await client.query(
        `
        SELECT COUNT(*)::INTEGER AS checked_in_guests
        FROM check_ins
        WHERE booking_id = $1
        `,
        [booking_id]
      );

      const totalGuests = Number(bookingGuestsResult.rows[0].total_guests);
      const checkedInGuests = Number(checkedInGuestsResult.rows[0].checked_in_guests);

      if (totalGuests > 0 && checkedInGuests >= totalGuests) {
        await client.query(
          `
          UPDATE bookings
          SET booking_status = 'CHECKED_IN', updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          `,
          [booking_id]
        );
      }

      const amountValue = Number(amount);
      let paymentCreated = false;

      if (Number.isFinite(amountValue) && amountValue > 0) {
        const normalizedMethod = String(payment_method || "CASH").toUpperCase();

        await client.query(
          `
          INSERT INTO payments (
            booking_id,
            amount,
            payment_method,
            transaction_number,
            payment_date,
            payment_status,
            remarks,
            received_by
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8
          )
          `,
          [
            booking_id,
            amountValue,
            normalizedMethod,
            null,
            actual_check_in_date,
            successfulPaymentStatus,
            remarks ? String(remarks).trim() : "Manual pre-checkin entry recorded by authorized staff.",
            checked_in_by,
          ]
        );

        paymentCreated = true;
      }

      await client.query("COMMIT");

      res.status(201).json({
        message: "Pre-checkin recorded successfully.",
        payment_created: paymentCreated,
        approval_status: booking.approval_status,
        checkIn: checkInResult.rows[0],
        actual_check_in_time: actualCheckInTimestamp,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("POST /api/check-ins/manual error:", error);
      res.status(500).json({
        message: "Unable to record the manual pre-checkin.",
      });
    } finally {
      client.release();
    }
  }
);

/* =========================================
   POST CHECK-IN
========================================= */

router.post(
  "/",
  async (
    req: Request,
    res: Response
  ): Promise<void> => {

    const {
      allotment_id,
      booking_id,
      guest_id,
      room_id,
      bed_id = null,
      checked_in_by,
      remarks,
    } = req.body;

    /* =========================================
       BASIC VALIDATION
    ========================================= */

    if (!allotment_id) {

      res.status(400).json({
        message:
          "Allotment ID is required.",
      });

      return;
    }

    if (!booking_id) {

      res.status(400).json({
        message:
          "Booking ID is required.",
      });

      return;
    }

    if (!guest_id) {

      res.status(400).json({
        message:
          "Guest ID is required.",
      });

      return;
    }

    if (!room_id) {

      res.status(400).json({
        message:
          "Room ID is required.",
      });

      return;
    }

    if (!checked_in_by) {

      res.status(400).json({
        message:
          "Checked-in user ID is required.",
      });

      return;
    }

    const requestedBedId =
      bed_id || null;

    const client =
      await pool.connect();

    try {

      await client.query("BEGIN");

      /* =========================================
         LOCK AND VERIFY ALLOTMENT
      ========================================= */

      const allotmentResult =
        await client.query(
          `
          SELECT
            a.id,
            a.booking_id,
            a.guest_id,
            a.room_id,
            a.bed_id,
            a.allotment_status,

            r.room_number

          FROM allotments a

          INNER JOIN rooms r
            ON r.id = a.room_id

          WHERE a.id = $1

          FOR UPDATE
          `,
          [
            allotment_id,
          ]
        );

      if (
        allotmentResult.rows.length === 0
      ) {

        await client.query("ROLLBACK");

        res.status(404).json({
          message:
            "The selected allotment was not found.",
        });

        return;
      }

      const allotment =
        allotmentResult.rows[0];

      /* =========================================
         VERIFY ALLOTMENT STATUS
      ========================================= */

      if (
        allotment.allotment_status !==
        "ALLOTTED"
      ) {

        await client.query("ROLLBACK");

        res.status(400).json({
          message:
            "This allotment is no longer active.",
        });

        return;
      }

      /* =========================================
         VERIFY REQUEST MATCHES DATABASE
      ========================================= */

      if (
        allotment.booking_id !==
          booking_id ||
        allotment.guest_id !==
          guest_id ||
        allotment.room_id !==
          room_id ||
        allotment.bed_id !==
          requestedBedId
      ) {

        await client.query("ROLLBACK");

        res.status(400).json({
          message:
            "The check-in information does not match the active allotment.",
        });

        return;
      }

      /* =========================================
         ACCOMMODATION TYPE
      ========================================= */

      /* =========================================
         ROOM-LEVEL / BED-LEVEL RULE

         AC / NAC / VIP:
            bed_id = NULL

         DM / HALL:
            bed_id = actual bed
      ========================================= */

      if (
        allotment.bed_id === null &&
        requestedBedId !== null
      ) {

        await client.query("ROLLBACK");

        res.status(400).json({
          message:
            "This is a room-level allotment. A bed must not be supplied for check-in.",
        });

        return;
      }

      if (
        allotment.bed_id !== null &&
        requestedBedId === null
      ) {

        await client.query("ROLLBACK");

        res.status(400).json({
          message:
            "This is a bed-level allotment. The allotted bed is required for check-in.",
        });

        return;
      }

      /* =========================================
         LOCK AND VERIFY BOOKING
      ========================================= */

      const bookingResult =
        await client.query(
          `
          SELECT
            id,
            booking_reference,
            booking_status,
            approval_status,
            acceptance_status,
            check_in_date,
            expected_check_out_date

          FROM bookings

          WHERE id = $1

          FOR UPDATE
          `,
          [
            booking_id,
          ]
        );

      if (
        bookingResult.rows.length === 0
      ) {

        await client.query("ROLLBACK");

        res.status(404).json({
          message:
            "The booking associated with this allotment was not found.",
        });

        return;
      }

      const booking =
        bookingResult.rows[0];

      if (booking.approval_status !== "APPROVED") {

        await client.query("ROLLBACK");

        res.status(403).json({
          message:
            "Check-in is not allowed until the booking is approved by its responsible authority.",
          approval_status: booking.approval_status,
          booking_reference: booking.booking_reference,
        });

        return;
      }

      if (booking.acceptance_status !== "ACCEPTED") {
        await client.query("ROLLBACK");
        res.status(403).json({
          message:
            "Check-in is not allowed until the guest accepts the assigned accommodation.",
          acceptance_status: booking.acceptance_status,
          booking_reference: booking.booking_reference,
        });
        return;
      }

      const successfulPaymentStatus =
        await getSuccessfulPaymentStatus(client);

      const paymentAndInvoiceResult =
        await client.query(
          `
          SELECT 1
          FROM payments p
          INNER JOIN booking_invoices bi
            ON bi.payment_id = p.id
           AND bi.booking_id = p.booking_id
          WHERE p.booking_id = $1
            AND p.payment_status = $2
          LIMIT 1
          `,
          [booking_id, successfulPaymentStatus]
        );

      if (paymentAndInvoiceResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(403).json({
          message:
            "Check-in requires a successful payment and its invoice.",
          booking_reference: booking.booking_reference,
        });
        return;
      }

      const turnoverResult = await client.query(
        `
        SELECT
          (
            CURRENT_TIMESTAMP AT TIME ZONE $6::text
          ) < ($1::date + $2::time) AS before_check_in_time,
          EXISTS (
            SELECT 1
            FROM check_ins previous_check_in
            INNER JOIN allotments previous_allotment
              ON previous_allotment.id =
                previous_check_in.allotment_id
            INNER JOIN bookings previous_booking
              ON previous_booking.id =
                previous_allotment.booking_id
            LEFT JOIN check_outs previous_check_out
              ON previous_check_out.allotment_id =
                previous_allotment.id
            WHERE previous_allotment.room_id = $3
              AND previous_allotment.booking_id <> $5
              AND previous_booking.check_in_date <= $1::date
              AND previous_allotment.allotment_status = 'ALLOTTED'
              AND previous_check_out.id IS NULL
              AND (
                $4::uuid IS NULL
                OR previous_allotment.bed_id IS NULL
                OR previous_allotment.bed_id = $4::uuid
              )
          ) AS previous_guest_still_in_accommodation,
          EXISTS (
            SELECT 1
            FROM housekeeping_tasks task
            INNER JOIN allotments previous_allotment
              ON previous_allotment.id = task.allotment_id
            INNER JOIN bookings previous_booking
              ON previous_booking.id =
                previous_allotment.booking_id
            WHERE task.room_id = $3
              AND previous_allotment.booking_id <> $5
              AND previous_booking.expected_check_out_date <= $1::date
              AND task.task_status <> 'CLEARED'
              AND (
                $4::uuid IS NULL
                OR previous_allotment.bed_id IS NULL
                OR previous_allotment.bed_id = $4::uuid
              )
          ) AS housekeeping_incomplete
        `,
        [
          booking.check_in_date,
          BOOKING_CHECK_IN_TIME,
          allotment.room_id,
          allotment.bed_id,
          booking_id,
          BOOKING_TIME_ZONE,
        ]
      );

      const turnover = turnoverResult.rows[0];

      if (turnover.before_check_in_time) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message:
            `Check-in is available from ${BOOKING_CHECK_IN_TIME} on the scheduled arrival date.`,
        });
        return;
      }

      if (turnover.previous_guest_still_in_accommodation) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message:
            "Check-in is blocked until the previous guest has checked out of this accommodation.",
        });
        return;
      }

      if (turnover.housekeeping_incomplete) {
        await client.query("ROLLBACK");
        res.status(409).json({
          message:
            "Check-in is blocked until housekeeping has cleared the accommodation.",
        });
        return;
      }

      /* =========================================
         ALREADY CHECKED IN?
      ========================================= */

      const existingCheckIn =
        await client.query(
          `
          SELECT
            id,
            check_in_time

          FROM check_ins

          WHERE allotment_id = $1

          LIMIT 1
          `,
          [
            allotment_id,
          ]
        );

      if (
        existingCheckIn.rows.length > 0
      ) {

        await client.query("ROLLBACK");

        res.status(409).json({
          message:
            "This guest has already been checked in.",
          checkIn:
            existingCheckIn.rows[0],
        });

        return;
      }

      /* =========================================
         VERIFY USER
      ========================================= */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            full_name,
            is_active

          FROM users

          WHERE id = $1
          `,
          [
            checked_in_by,
          ]
        );

      if (
        userResult.rows.length === 0
      ) {

        await client.query("ROLLBACK");

        res.status(404).json({
          message:
            "The checking-in user was not found.",
        });

        return;
      }

      if (
        !userResult.rows[0].is_active
      ) {

        await client.query("ROLLBACK");

        res.status(403).json({
          message:
            "The checking-in user is inactive.",
        });

        return;
      }

      /* =========================================
         CREATE CHECK-IN
      ========================================= */

      const checkInResult =
        await client.query(
          `
          INSERT INTO check_ins (
            booking_id,
            guest_id,
            allotment_id,
            check_in_time,
            checked_in_by,
            remarks
          )

          VALUES (
            $1,
            $2,
            $3,
            CURRENT_TIMESTAMP,
            $4,
            $5
          )

          RETURNING
            id,
            booking_id,
            guest_id,
            allotment_id,
            check_in_time,
            checked_in_by,
            remarks
          `,
          [
            booking_id,
            guest_id,
            allotment_id,
            checked_in_by,
            remarks ?? null,
          ]
        );

      /* =========================================
         UPDATE BED STATUS

         Only DM / HALL normally have a bed_id.

         Mark the exact bed occupied after
         successful check-in.
      ========================================= */

      if (
        allotment.bed_id !== null
      ) {

        await client.query(
          `
          UPDATE beds
          SET
            bed_status = 'OCCUPIED'
          WHERE id = $1
          `,
          [
            allotment.bed_id,
          ]
        );

      }

      /* =========================================
         UPDATE ROOM STATUS

         After a successful check-in, the room
         becomes occupied.

         This applies to room-level AC/NAC/VIP
         and also to DM/HALL when a bed is checked in.
      ========================================= */

      await client.query(
        `
        UPDATE rooms
        SET
          room_status = 'OCCUPIED',
          updated_at = CURRENT_TIMESTAMP

        WHERE id = $1
        `,
        [
          allotment.room_id,
        ]
      );

      /* =========================================
         UPDATE BOOKING STATUS

         Only mark the booking CHECKED_IN when
         all booking guests have checked in.
      ========================================= */

      const bookingGuestsResult =
        await client.query(
          `
          SELECT
            COUNT(*)::INTEGER AS total_guests

          FROM booking_guests

          WHERE booking_id = $1
          `,
          [
            booking_id,
          ]
        );

      const checkedInGuestsResult =
        await client.query(
          `
          SELECT
            COUNT(*)::INTEGER AS checked_in_guests

          FROM check_ins

          WHERE booking_id = $1
          `,
          [
            booking_id,
          ]
        );

      const totalGuests =
        Number(
          bookingGuestsResult
            .rows[0]
            .total_guests
        );

      const checkedInGuests =
        Number(
          checkedInGuestsResult
            .rows[0]
            .checked_in_guests
        );

      if (
        totalGuests > 0 &&
        checkedInGuests >=
          totalGuests
      ) {

        await client.query(
          `
          UPDATE bookings

          SET
            booking_status = 'CHECKED_IN',
            updated_at = CURRENT_TIMESTAMP

          WHERE id = $1
          `,
          [
            booking_id,
          ]
        );

      }

      /* =========================================
         COMMIT
      ========================================= */

      await client.query("COMMIT");

      res.status(201).json({

        message:
          "Check-in completed successfully.",

        approval_status:
          booking.approval_status,

        checkIn:
          checkInResult.rows[0],

      });

    } catch (error) {

      await client.query("ROLLBACK");

      console.error(
        "POST /api/check-ins error:",
        error
      );

      res.status(500).json({
        message:
          "Unable to complete check-in.",
      });

    } finally {

      client.release();

    }
  }
);

export default router;