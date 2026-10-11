import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../config/db.js";

const router = express.Router();

/*
 * GET /api/check-outs/eligible
 *
 * Returns ONLY guests who:
 *
 * 1. Have an active allotment
 * 2. Have actually checked in
 * 3. Have not yet been checked out
 *
 * Room-level allotments:
 * AC / AC VIP / NAC
 *     bed_id = NULL
 *
 * Bed-level allotments:
 * DM / HALL
 *     bed_id = actual bed
 */
router.get(
    "/eligible",
    async (_req: Request, res: Response): Promise<void> => {
        try {
            const result = await pool.query(`
                SELECT
                    a.id AS allotment_id,
                    a.booking_id,
                    b.booking_reference,
                    sm.full_name AS booking_person_name,
                    sm.address AS booking_person_address,
                    bp.guest_type,

                    ci.guest_id AS guest_id,
                    g.guest_name,
                    g.mobile_number,

                    a.room_id,
                    r.room_number,
                    r.room_status,

                    a.bed_id,
                    bd.bed_number,
                    bd.bed_status,

                    b.check_in_date,
                    b.expected_check_out_date,

                    a.allotment_status,

                    ci.id AS check_in_id,
                    ci.check_in_time,

                    'CHECKED_IN' AS check_in_status

                FROM allotments a

                INNER JOIN bookings b
                    ON b.id = a.booking_id

                LEFT JOIN booking_service_members sm
                    ON sm.booking_id = b.id

                LEFT JOIN booking_pricing bp
                    ON bp.booking_id = b.id

                INNER JOIN check_ins ci
                    ON ci.allotment_id = a.id

                INNER JOIN guests g
                    ON g.id = ci.guest_id

                INNER JOIN rooms r
                    ON r.id = a.room_id

                LEFT JOIN beds bd
                    ON bd.id = a.bed_id

                LEFT JOIN check_outs co
                    ON co.allotment_id = a.id

                WHERE
                    a.allotment_status = 'ALLOTTED'
                    AND co.id IS NULL

                ORDER BY
                    b.check_in_date ASC,
                    r.room_number ASC,
                    bd.bed_number ASC NULLS FIRST,
                    g.guest_name ASC
            `);

            res.json(result.rows);
        } catch (error) {
            console.error(
                "Error loading check-out eligible guests:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to load guests eligible for check-out.",
            });
        }
    }
);


/*
 * POST /api/check-outs
 *
 * Checks out ONE guest who has actually checked in.
 *
 * After checkout:
 *
 *     allotment
 *         ALLOTTED
 *             ↓
 *         RELEASED
 *
 *     bed / room
 *         OCCUPIED
 *             ↓
 *         AVAILABLE
 */
router.post(
    "/",
    async (req: Request, res: Response): Promise<void> => {
        const {
            booking_id,
            guest_id,
            allotment_id,
            checked_out_by,
            checkout_type,
            remarks,
        } = req.body;

        if (
            !booking_id ||
            !guest_id ||
            !allotment_id ||
            !checked_out_by ||
            !["SCHEDULED", "PRE_CHECKOUT"].includes(
                checkout_type
            )
        ) {
            res.status(400).json({
                message:
                    "booking_id, guest_id, allotment_id, checked_out_by and a valid checkout_type are required.",
            });

            return;
        }

        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            /*
             * LOCK ACTIVE ALLOTMENT
             */
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

                INNER JOIN rooms r
                    ON r.id = a.room_id

                WHERE a.id = $1

                FOR UPDATE
                `,
                [allotment_id]
            );

            if (allotmentResult.rows.length === 0) {
                await client.query("ROLLBACK");

                res.status(404).json({
                    message: "Allotment not found.",
                });

                return;
            }

            const allotment = allotmentResult.rows[0];

            /*
             * VERIFY ACTIVE ALLOTMENT
             */
            if (
                allotment.allotment_status !==
                "ALLOTTED"
            ) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "This allotment is no longer active and cannot be checked out.",
                });

                return;
            }

            /*
             * VERIFY BOOKING + ALLOTMENT
             */
            if (
                allotment.booking_id !== booking_id ||
                allotment.guest_id !== guest_id
            ) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "The selected booking, guest and allotment do not match.",
                });

                return;
            }

            /*
             * REQUIRE REAL CHECK-IN
             */
            const checkInResult = await client.query(
                `
                SELECT
                    id,
                    booking_id,
                    guest_id,
                    allotment_id,
                    check_in_time

                FROM check_ins

                WHERE allotment_id = $1

                ORDER BY check_in_time DESC

                LIMIT 1

                FOR UPDATE
                `,
                [allotment_id]
            );

            if (checkInResult.rows.length === 0) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "This guest has not been checked in yet. Check-out is allowed only after check-in.",
                });

                return;
            }

            const checkIn = checkInResult.rows[0];

            /*
             * VERIFY CHECK-IN GUEST
             */
            if (
                checkIn.booking_id !== booking_id ||
                checkIn.guest_id !== guest_id
            ) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "The check-in record does not match the selected guest.",
                });

                return;
            }

            /*
             * CHECK EXISTING CHECKOUT
             */
            const existingCheckout =
                await client.query(
                    `
                    SELECT id
                    FROM check_outs
                    WHERE allotment_id = $1
                    LIMIT 1
                    `,
                    [allotment_id]
                );

            if (existingCheckout.rows.length > 0) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "This guest has already been checked out.",
                });

                return;
            }

            const earlyCheckoutResult =
                await client.query(
                    `
                    SELECT
                        expected_check_out_date,
                        CURRENT_DATE < expected_check_out_date
                            AS is_early_checkout
                    FROM bookings
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [booking_id]
                );

            const isEarlyByDate =
                earlyCheckoutResult.rows[0]
                    ?.is_early_checkout;

            if (
                isEarlyByDate &&
                checkout_type !== "PRE_CHECKOUT"
            ) {
                await client.query("ROLLBACK");
                res.status(400).json({
                    message:
                        "A checkout before the scheduled date must use the Pre Check-Out workflow.",
                });
                return;
            }

            if (checkout_type === "PRE_CHECKOUT") {
                const refundMemoResult =
                    await client.query(
                        `
                        SELECT r.id
                        FROM refunds r
                        WHERE
                            r.booking_id = $1
                            AND r.refund_status = 'APPROVED'
                            AND EXISTS (
                                SELECT 1
                                FROM refund_memos rm
                                WHERE rm.refund_id = r.id
                            )
                        LIMIT 1
                        `,
                        [booking_id]
                    );

                if (refundMemoResult.rowCount === 0) {
                    await client.query("ROLLBACK");

                    res.status(403).json({
                        message:
                            "Early check-out requires a calculated refund and an approved refund memo.",
                    });

                    return;
                }
            }

            /*
             * VERIFY USER
             */
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
                    [checked_out_by]
                );

            if (userResult.rows.length === 0) {
                await client.query("ROLLBACK");

                res.status(400).json({
                    message:
                        "Checkout user was not found.",
                });

                return;
            }

            if (!userResult.rows[0].is_active) {
                await client.query("ROLLBACK");

                res.status(403).json({
                    message:
                        "The checkout user is inactive.",
                });

                return;
            }

            const remainingBookingGuestsResult =
                await client.query(
                    `
                    SELECT COUNT(*)::INTEGER AS remaining_count
                    FROM check_ins ci
                    LEFT JOIN check_outs co
                        ON co.allotment_id = ci.allotment_id
                    WHERE ci.booking_id = $1
                        AND co.id IS NULL
                    `,
                    [booking_id]
                );

            if (
                Number(remainingBookingGuestsResult.rows[0].remaining_count) === 1
            ) {
                const feedbackResult = await client.query(
                    `
                    SELECT feedback_status
                    FROM booking_checkout_feedback
                    WHERE booking_id = $1
                    `,
                    [booking_id]
                );

                if (feedbackResult.rowCount === 0) {
                    await client.query("ROLLBACK");
                    res.status(409).json({
                        success: false,
                        message:
                            "Complete or skip the booking feedback form before the final guest checkout.",
                    });
                    return;
                }
            }

            /*
             * CREATE CHECKOUT
             */
            const checkoutResult =
                await client.query(
                    `
                    INSERT INTO check_outs (
                        booking_id,
                        guest_id,
                        allotment_id,
                        check_out_time,
                        checked_out_by,
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
                        check_out_time,
                        checked_out_by,
                        remarks
                    `,
                    [
                        booking_id,
                        guest_id,
                        allotment_id,
                        checked_out_by,
                        remarks || null,
                    ]
                );

            /*
             * RELEASE ALLOTMENT
             */
            await client.query(
                `
                UPDATE allotments
                SET
                    allotment_status = 'RELEASED',
                    released_at = CURRENT_TIMESTAMP
                WHERE id = $1
                `,
                [allotment_id]
            );

            /*
             * RELEASE BED
             *
             * DM / HALL normally have a bed.
             */
            if (allotment.bed_id !== null) {
                await client.query(
                    `
                    UPDATE beds
                    SET
                        bed_status = 'NEEDS_CLEANING'
                    WHERE id = $1
                    `,
                    [allotment.bed_id]
                );
            }

            const housekeepingTaskResult =
                await client.query(
                    `
                    INSERT INTO housekeeping_tasks (
                        id,
                        room_id,
                        allotment_id,
                        assigned_to,
                        task_status,
                        assigned_at,
                        remarks
                    )
                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        'NEEDS CLEANING',
                        CURRENT_TIMESTAMP,
                        $5
                    )
                    RETURNING id
                    `,
                    [
                        randomUUID(),
                        allotment.room_id,
                        allotment_id,
                        checked_out_by,
                        remarks
                            ? `Checkout housekeeping: ${String(remarks).trim()}`
                            : "Checkout housekeeping required.",
                    ]
                );

            /*
             * CHECK WHETHER ANOTHER REAL
             * CHECKED-IN GUEST IS STILL IN THE ROOM.
             */
            const currentOccupantsResult =
                await client.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER AS current_count

                    FROM check_ins ci

                    INNER JOIN allotments a2
                        ON a2.id = ci.allotment_id

                    LEFT JOIN check_outs co2
                        ON co2.allotment_id = ci.allotment_id

                    WHERE
                        a2.room_id = $1
                        AND co2.id IS NULL
                    `,
                    [allotment.room_id]
                );

            const currentOccupantCount =
                Number(
                    currentOccupantsResult.rows[0]
                        .current_count
                );

            /*
             * NO OTHER CHECKED-IN GUEST:
             * ROOM BECOMES AVAILABLE.
             *
             * OTHER CHECKED-IN GUEST:
             * ROOM REMAINS OCCUPIED.
             */
            const newRoomStatus =
                currentOccupantCount > 0
                    ? "OCCUPIED"
                    : "NEEDS_CLEANING";

            await client.query(
                `
                UPDATE rooms
                SET
                    room_status = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE
                    id = $1
                    AND room_status <> 'STORE'
                `,
                [
                    allotment.room_id,
                    newRoomStatus,
                ]
            );

            /*
             * UPDATE BOOKING STATUS
             */
            const remainingCheckedInResult =
                await client.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER AS remaining_count

                    FROM check_ins ci

                    INNER JOIN allotments a2
                        ON a2.id = ci.allotment_id

                    LEFT JOIN check_outs co2
                        ON co2.allotment_id =
                           ci.allotment_id

                    WHERE
                        ci.booking_id = $1
                        AND co2.id IS NULL
                    `,
                    [booking_id]
                );

            const remainingCount =
                Number(
                    remainingCheckedInResult.rows[0]
                        .remaining_count
                );

            if (remainingCount === 0) {
                await client.query(
                    `
                    UPDATE bookings
                    SET
                        booking_status = 'CHECKED_OUT',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                    `,
                    [booking_id]
                );
            }

            /*
             * COMMIT
             */
            await client.query("COMMIT");

            res.status(201).json({
                message:
                    "Guest checked out successfully. The released accommodation requires housekeeping before reuse.",

                checkout:
                    checkoutResult.rows[0],

                room_status:
                    newRoomStatus,

                housekeeping_task_id:
                    housekeepingTaskResult.rows[0].id,

                bed_status:
                    allotment.bed_id !== null
                        ? "NEEDS_CLEANING"
                        : null,

                housekeeping_status:
                    "NEEDS_CLEANING",
            });

        } catch (error) {
            await client.query("ROLLBACK");

            console.error(
                "Error processing checkout:",
                error
            );

            res.status(500).json({
                message:
                    "Failed to process checkout.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            });

        } finally {
            client.release();
        }
    }
);

export default router;