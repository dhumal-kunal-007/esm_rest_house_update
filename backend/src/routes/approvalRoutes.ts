import {
    Router,
    Request,
    Response,
} from "express";

import { pool } from "../config/db.js";
import { hasCompleteAcceptedAccommodations } from "../services/bookingWorkflowProgress.js";

const router = Router();

/* =========================================================
   HELPER
   ========================================================= */

const getBookingAcceptances = async (
    bookingId: string
) => {
    return pool.query(
        `
        SELECT
            ba.id,
            ba.booking_id,
            ba.guest_id,
            ba.room_id,
            ba.bed_id,
            ba.acceptance_status,
            ba.accepted_at,
            ba.remarks,

            r.room_number,
            r.room_status,

            b.bed_number,
            b.bed_status,

            rc.category_name,

            g.guest_name,
            g.gender,
            g.mobile_number,
            g.relationship,
            g.rank,

            COALESCE(
                ba.approval_authority_role,
                rp.role_name
            ) AS responsible_role

        FROM booking_acceptances ba

        INNER JOIN rooms r
            ON r.id = ba.room_id

        LEFT JOIN beds b
            ON b.id = ba.bed_id

        INNER JOIN room_categories rc
            ON rc.id = r.category_id

        LEFT JOIN guests g
            ON g.id = ba.guest_id

        LEFT JOIN LATERAL (
            SELECT
                role_name
            FROM room_permissions
            WHERE
                room_id = r.id
                AND can_approve = TRUE
            ORDER BY role_name
            LIMIT 1
        ) rp
            ON TRUE

        WHERE
            ba.booking_id = $1

        ORDER BY
            r.room_number,
            b.bed_number
        `,
        [bookingId]
    );
};

/* =========================================================
   GET PENDING APPROVALS

   GET /api/approvals/pending/:userId

   IMPORTANT:
   Approval is now based on booking_acceptances.

   Physical allotments are NOT required at this stage.

   Flow:
   Acceptance
       ↓
   Booking Approval
       ↓
   Payment
       ↓
   Invoice
       ↓
   Physical Room Lock
       ↓
   allotments
========================================================= */

router.get(
    "/pending/:userId",
    async (
        req: Request,
        res: Response
    ) => {
        const user = req.authUser;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user is required.",
            });
        }

        try {
            /* =========================================
               GET BOOKINGS WITH ACCEPTED ROOMS/BEDS

               No allotments here.
            ========================================= */

            const result =
                await pool.query(
                    `
                SELECT
                        bk.id AS booking_id,
                        bk.booking_reference,
                        bk.booking_type,
                        bk.booking_date,
                        bk.check_in_date,
                        bk.expected_check_out_date,
                        bk.number_of_guests,
                        bk.booking_status,
                        bk.approval_status,
                        bk.guest_type,
                        bk.acceptance_status,
                        bk.purpose_of_visit,
                        bk.special_requirements,
                        bk.is_emergency,
                        bk.created_at,
                        bp.accommodation_category,
                        bp.accommodation_days,
                        bp.accommodation_amount,
                        bp.additional_member_amount,
                        bp.total_amount,
                        COALESCE(
                            ba.approval_authority_role,
                            rp.role_name
                        ) AS responsible_role,
                        sm.service_number,
                        sm.rank AS service_member_rank,
                        sm.full_name AS service_member_name,
                        sm.address AS service_member_address,
                        sm.identity_number AS service_member_identity_number,
                        ba.id AS allotment_id,
                        ba.room_id,
                        ba.bed_id,
                        ba.guest_id,
                        NULL::uuid AS allotted_by,
                        FALSE AS is_emergency_allotment,
                        ba.accepted_at AS allotted_at,
                        ba.remarks AS allotment_remarks,
                        r.room_number,
                        r.room_status,
                        bed.bed_number,
                        bed.bed_status,
                        rc.category_name,
                        guest.guest_name,
                        guest.gender,
                        guest.mobile_number,
                        guest.relationship,
                        guest.rank,

                        creator.id AS created_by,
                        creator.full_name AS created_by_name,
                        creator.username AS created_by_username

                    FROM bookings bk

                    INNER JOIN booking_pricing bp
                        ON bp.booking_id = bk.id

                    INNER JOIN booking_service_members sm
                        ON sm.booking_id = bk.id

                    INNER JOIN booking_acceptances ba
                        ON ba.booking_id = bk.id
                        AND ba.acceptance_status = 'ACCEPTED'

                    LEFT JOIN LATERAL (
                        SELECT role_name
                        FROM room_permissions
                        WHERE room_id = ba.room_id
                            AND can_approve = TRUE
                        ORDER BY role_name
                        LIMIT 1
                    ) rp ON TRUE

                    INNER JOIN rooms r
                        ON r.id = ba.room_id

                    INNER JOIN room_categories rc
                        ON rc.id = r.category_id

                    LEFT JOIN beds bed
                        ON bed.id = ba.bed_id

                    INNER JOIN guests guest
                        ON guest.id = ba.guest_id

                    INNER JOIN users creator
                        ON creator.id = bk.created_by

                    WHERE
                        bk.approval_status = 'PENDING'
                        AND bk.acceptance_status = 'ACCEPTED'
                        AND (
                            SELECT COUNT(DISTINCT complete_ba.guest_id)
                            FROM booking_acceptances complete_ba
                            INNER JOIN booking_guests complete_bg
                                ON complete_bg.booking_id = complete_ba.booking_id
                                AND complete_bg.guest_id = complete_ba.guest_id
                            WHERE
                                complete_ba.booking_id = bk.id
                                AND complete_ba.acceptance_status = 'ACCEPTED'
                        ) = bk.number_of_guests
                        AND NOT EXISTS (
                            SELECT 1
                            FROM booking_acceptances other_ba
                            INNER JOIN rooms other_room
                                ON other_room.id = other_ba.room_id
                            LEFT JOIN LATERAL (
                                SELECT role_name
                                FROM room_permissions
                                WHERE room_id = other_room.id
                                    AND can_approve = TRUE
                                ORDER BY role_name
                                LIMIT 1
                            ) other_rp ON TRUE
                            WHERE
                                other_ba.booking_id = bk.id
                                AND other_ba.acceptance_status = 'ACCEPTED'
                                AND COALESCE(
                                    other_ba.approval_authority_role,
                                    other_rp.role_name
                                ) IS DISTINCT FROM $1
                        )

                    ORDER BY
                        bk.created_at ASC,
                        bk.booking_reference ASC
                    `,
                    [user.role]
                );

            return res.json({
                success: true,
                approvals: result.rows,
            });
        } catch (error) {
            console.error(
                "Get pending approvals error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve pending approvals.",
            });
        }
    }
);

/* =========================================================
   GET APPROVAL DETAILS

   GET /api/approvals/:bookingId
========================================================= */

router.get(
    "/:bookingId",
    async (
        req: Request,
        res: Response
    ) => {
        const bookingId = String(req.params.bookingId);

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                message: "Booking ID is required.",
            });
        }

        try {
            /* =========================================
               BOOKING
            ========================================= */

            const bookingResult =
                await pool.query(
                    `
                    SELECT
                        bk.id,
                        bk.booking_reference,
                        bk.booking_type,
                        bk.booking_date,
                        bk.check_in_date,
                        bk.expected_check_out_date,
                        bk.number_of_guests,
                        bk.booking_status,
                        bk.approval_status,
                        bk.guest_type,
                        bk.acceptance_status,
                        bk.purpose_of_visit,
                        bk.special_requirements,
                        bk.is_emergency,
                        bk.created_at,
                        bp.accommodation_category,
                        bp.accommodation_days,
                        bp.accommodation_amount,
                        bp.additional_member_amount,
                        bp.total_amount,

                        u.id AS created_by,
                        u.full_name AS created_by_name,
                        u.username AS created_by_username

                    FROM bookings bk

                    LEFT JOIN booking_pricing bp
                        ON bp.booking_id = bk.id

                    INNER JOIN users u
                        ON u.id = bk.created_by

                    WHERE bk.id = $1
                    `,
                    [bookingId]
                );

            if (
                bookingResult.rowCount === 0
            ) {
                return res.status(404).json({
                    success: false,
                    message: "Booking not found.",
                });
            }

            const booking =
                bookingResult.rows[0];
            const caller = req.authUser;

            if (
                !caller ||
                (
                    caller.role !== "ADMIN" &&
                    booking.created_by !== caller.id
                )
            ) {
                const authorityResult = caller
                    ? await pool.query(
                        `
                        SELECT ba.id
                        FROM booking_acceptances ba
                        WHERE
                            ba.booking_id = $1
                            AND ba.acceptance_status = 'ACCEPTED'
                            AND NOT EXISTS (
                                SELECT 1
                                WHERE COALESCE(
                                    ba.approval_authority_role,
                                    (
                                        SELECT rp.role_name
                                        FROM room_permissions rp
                                        WHERE rp.room_id = ba.room_id
                                            AND rp.can_approve = TRUE
                                        ORDER BY rp.role_name
                                        LIMIT 1
                                    )
                                ) = $2
                            )
                        LIMIT 1
                        `,
                        [bookingId, caller.role]
                    )
                    : { rowCount: 0 };

                if (
                    (authorityResult.rowCount ?? 0) > 0
                ) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not authorized to view this booking's approval details.",
                    });
                }

                const acceptedCount = caller
                    ? await pool.query(
                        `
                        SELECT 1
                        FROM booking_acceptances
                        WHERE
                            booking_id = $1
                            AND acceptance_status = 'ACCEPTED'
                        LIMIT 1
                        `,
                        [bookingId]
                    )
                    : { rowCount: 0 };

                if (
                    (acceptedCount.rowCount ?? 0) === 0
                ) {
                    return res.status(403).json({
                        success: false,
                        message:
                            "You are not authorized to view this booking's approval details.",
                    });
                }
            }

            /* =========================================
               ACCEPTED ACCOMMODATIONS

               These are selections only.

               They are NOT physical allotments yet.
            ========================================= */

            const acceptanceResult =
                await getBookingAcceptances(
                    bookingId
                );

            /* =========================================
               APPROVAL HISTORY
            ========================================= */

            const approvalResult =
                await pool.query(
                    `
                    SELECT
                        ba.id,
                        ba.booking_id,
                        ba.approver_id,
                        ba.approval_status,
                        ba.remarks,
                        ba.approved_at,
                        ba.created_at,

                        u.full_name AS approver_name,
                        u.username AS approver_username,

                        r.role_name AS approver_role

                    FROM booking_approvals ba

                    INNER JOIN users u
                        ON u.id = ba.approver_id

                    INNER JOIN roles r
                        ON r.id = u.role_id

                    WHERE
                        ba.booking_id = $1

                    ORDER BY
                        ba.created_at DESC
                    `,
                    [bookingId]
                );

            return res.json({
                success: true,

                booking:
                    booking,

                accommodations:
                    acceptanceResult.rows,

                /*
                 * Keep allotments as an empty array for
                 * frontend compatibility.
                 *
                 * Physical allotment will happen later
                 * after payment + invoice.
                 */
                allotments: [],

                approvals:
                    approvalResult.rows,
            });
        } catch (error) {
            console.error(
                "Get approval details error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to retrieve approval details.",
            });
        }
    }
);

/* =========================================================
   APPROVE BOOKING

   POST /api/approvals/:bookingId/approve

   Body:
   {
       "approver_id": "...",
       "remarks": "..."
   }

   IMPORTANT:
   - Does NOT create allotment.
   - Does NOT lock room.
   - Does NOT change room_status.
   - Does NOT change bed_status.

   Physical locking happens later:
   Payment → Invoice → RoomLocked
========================================================= */

router.post(
    "/:bookingId/approve",
    async (
        req: Request,
        res: Response
    ) => {
        const bookingId = String(req.params.bookingId);

        const {
            approver_id,
            remarks = null,
        } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                message:
                    "Booking ID is required.",
            });
        }

        if (!approver_id) {
            return res.status(400).json({
                success: false,
                message:
                    "Approver ID is required.",
            });
        }

        const client =
            await pool.connect();

        try {
            await client.query(
                "BEGIN"
            );

            /* =========================================
               VERIFY APPROVER
            ========================================= */

            const userResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.full_name,
                        u.username,
                        u.is_active,
                        r.role_name
                    FROM users u

                    INNER JOIN roles r
                        ON r.id = u.role_id

                    WHERE u.id = $1
                    `,
                    [approver_id]
                );

            if (
                userResult.rowCount === 0
            ) {
                throw new Error(
                    "Approver was not found."
                );
            }

            const approver =
                userResult.rows[0];

            if (!approver.is_active) {
                throw new Error(
                    "Approver account is inactive."
                );
            }

            /* =========================================
               LOCK BOOKING
            ========================================= */

            const bookingResult =
                await client.query(
                    `
                    SELECT
                        id,
                        booking_reference,
                        number_of_guests,
                        booking_status,
                        approval_status,
                        guest_type,
                        acceptance_status
                    FROM bookings
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [bookingId]
                );

            if (
                bookingResult.rowCount === 0
            ) {
                throw new Error(
                    "Booking not found."
                );
            }

            const booking =
                bookingResult.rows[0];

            if (
                !req.authUser ||
                req.authUser.id !== approver_id
            ) {
                throw new Error(
                    "The authenticated approver identity does not match this request."
                );
            }

            if (
                booking.approval_status !==
                "PENDING"
            ) {
                throw new Error(
                    `This booking is already ${String(
                        booking.approval_status
                    ).toLowerCase()}.`
                );
            }

            if (
                booking.booking_status !== "PENDING_APPROVAL"
            ) {
                throw new Error(
                    "This booking is no longer awaiting approval."
                );
            }

            const acceptedGuestResult = await client.query(
                `
                SELECT COUNT(DISTINCT ba.guest_id)::INTEGER AS accepted_guest_count
                FROM booking_acceptances ba
                INNER JOIN booking_guests bg
                    ON bg.booking_id = ba.booking_id
                    AND bg.guest_id = ba.guest_id
                WHERE
                    ba.booking_id = $1
                    AND ba.acceptance_status = 'ACCEPTED'
                `,
                [bookingId]
            );

            if (!hasCompleteAcceptedAccommodations(
                Number(acceptedGuestResult.rows[0]?.accepted_guest_count ?? 0),
                Number(booking.number_of_guests)
            )) {
                throw new Error(
                    "Every guest must have an accepted accommodation before approval."
                );
            }

            const pricingResult = await client.query(
                `
                SELECT total_amount
                FROM booking_pricing
                WHERE booking_id = $1
                FOR UPDATE
                `,
                [bookingId]
            );

            if (
                (pricingResult.rowCount ?? 0) === 0 ||
                Number(pricingResult.rows[0].total_amount) <= 0
            ) {
                throw new Error(
                    "A server-calculated pricing snapshot is required before approval."
                );
            }

            /* =========================================
               VERIFY ACCEPTANCE

               Every expected guest must have an
               accepted room/bed before approval.
            ========================================= */

            const acceptanceResult =
                await client.query(
                    `
                    SELECT
                        ba.id,
                        ba.room_id,
                        ba.bed_id,
                        ba.guest_id,
                        ba.acceptance_status,

                        r.room_number,

                        b.bed_number,

                        rp.role_name

                    FROM booking_acceptances ba

                    INNER JOIN rooms r
                        ON r.id = ba.room_id

                    LEFT JOIN beds b
                        ON b.id = ba.bed_id

                    LEFT JOIN LATERAL (
                        SELECT role_name
                        FROM room_permissions
                        WHERE room_id = r.id
                            AND can_approve = TRUE
                        ORDER BY role_name
                        LIMIT 1
                    ) rp ON TRUE

                    WHERE
                        ba.booking_id = $1
                        AND ba.acceptance_status = 'ACCEPTED'
                        AND COALESCE(
                            ba.approval_authority_role,
                            rp.role_name
                        ) = $2
                    `,
                    [
                        bookingId,
                        approver.role_name,
                    ]
                );

            if (
                acceptanceResult.rowCount === 0
            ) {
                throw new Error(
                    "You are not the responsible authority for the accepted accommodation."
                );
            }

            /* =========================================
               VERIFY ALL ACCEPTED ACCOMMODATIONS

               The approver must have authority for
               every accepted room/bed in this booking.

               This prevents approving a mixed-authority
               booking from the wrong authority.
            ========================================= */

            const allAcceptedResult =
                await client.query(
                    `
                    SELECT
                        ba.id,
                        ba.room_id,
                        r.room_number,

                        COALESCE(
                            ba.approval_authority_role,
                            rp.role_name,
                            ''
                        ) AS responsible_role

                    FROM booking_acceptances ba

                    INNER JOIN rooms r
                        ON r.id = ba.room_id

                    LEFT JOIN LATERAL (
                        SELECT
                            role_name
                        FROM room_permissions
                        WHERE
                            room_id = r.id
                            AND can_approve = TRUE
                        ORDER BY role_name
                        LIMIT 1
                    ) rp
                        ON TRUE

                    WHERE
                        ba.booking_id = $1
                        AND ba.acceptance_status = 'ACCEPTED'
                    `,
                    [bookingId]
                );

            if (
                allAcceptedResult.rowCount === 0
            ) {
                throw new Error(
                    "No accepted accommodation found for this booking."
                );
            }

            const unauthorizedRooms =
                allAcceptedResult.rows.filter(
                    (row) =>
                        row.responsible_role !==
                        approver.role_name
                );

            if (
                unauthorizedRooms.length > 0
            ) {
                const roomNames =
                    unauthorizedRooms
                        .map(
                            (row) =>
                                row.room_number
                        )
                        .join(", ");

                throw new Error(
                    `This booking contains accommodation requiring another responsible authority: ${roomNames}.`
                );
            }

            /* =========================================
               UPDATE / CREATE APPROVAL RECORD
            ========================================= */

            const existingApprovalResult =
                await client.query(
                    `
                    SELECT
                        id
                    FROM booking_approvals

                    WHERE
                        booking_id = $1
                        AND approver_id = $2
                        AND approval_status = 'PENDING'

                    ORDER BY
                        created_at DESC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        bookingId,
                        approver_id,
                    ]
                );

            let approval;

            if (
                (existingApprovalResult.rowCount ?? 0) >
                0
            ) {
                const updateResult =
                    await client.query(
                        `
                        UPDATE booking_approvals
                        SET
                            approval_status =
                                'APPROVED',

                            remarks = $3,

                            approved_at =
                                CURRENT_TIMESTAMP

                        WHERE
                            id = $1
                            AND booking_id = $2

                        RETURNING
                            id,
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at,
                            created_at
                        `,
                        [
                            existingApprovalResult
                                .rows[0]
                                .id,

                            bookingId,

                            remarks,
                        ]
                    );

                approval =
                    updateResult.rows[0];
            } else {
                const insertResult =
                    await client.query(
                        `
                        INSERT INTO booking_approvals (
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at
                        )

                        VALUES (
                            $1,
                            $2,
                            'APPROVED',
                            $3,
                            CURRENT_TIMESTAMP
                        )

                        RETURNING
                            id,
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at,
                            created_at
                        `,
                        [
                            bookingId,
                            approver_id,
                            remarks,
                        ]
                    );

                approval =
                    insertResult.rows[0];
            }

            /* =========================================
               UPDATE BOOKING APPROVAL STATUS

               IMPORTANT:
               Booking status stays pending until
               payment / invoice / room lock stage.
            ========================================= */

            await client.query(
                `
                UPDATE bookings
                SET
                    approval_status =
                        'APPROVED',

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [bookingId]
            );

            await client.query(
                `
                INSERT INTO booking_workflow_progress (
                    booking_id,
                    current_step,
                    updated_by,
                    updated_at
                )
                VALUES ($1, 'COMPLETED', $2, CURRENT_TIMESTAMP)
                ON CONFLICT (booking_id)
                DO UPDATE SET
                    current_step = 'COMPLETED',
                    updated_by = EXCLUDED.updated_by,
                    updated_at = CURRENT_TIMESTAMP
                `,
                [bookingId, approver_id]
            );

            await client.query(
                "COMMIT"
            );

            return res.status(200).json({
                success: true,

                message:
                    "Booking approved successfully.",

                booking: {
                    id:
                        booking.id,

                    booking_reference:
                        booking.booking_reference,

                    booking_status:
                        booking.booking_status,

                    approval_status:
                        "APPROVED",

                    guest_type:
                        booking.guest_type,

                    acceptance_status:
                        booking.acceptance_status,
                },

                approval,

                /*
                 * These are still selections,
                 * not physical allotments.
                 */
                accommodations:
                    acceptanceResult.rows,
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Approve booking error:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Unable to approve booking.";

            return res.status(400).json({
                success: false,
                message,
            });
        } finally {
            client.release();
        }
    }
);

/* =========================================================
   REJECT BOOKING

   POST /api/approvals/:bookingId/reject

   Body:
   {
       "approver_id": "...",
       "remarks": "Reason for rejection"
   }

   IMPORTANT:
   No allotment is released here because physical
   allotment does not exist yet.

   Acceptance is rejected and booking is rejected.
========================================================= */

router.post(
    "/:bookingId/reject",
    async (
        req: Request,
        res: Response
    ) => {
        const { bookingId } = req.params;

        const {
            approver_id,
            remarks = null,
        } = req.body;

        if (!bookingId) {
            return res.status(400).json({
                success: false,
                message:
                    "Booking ID is required.",
            });
        }

        if (!approver_id) {
            return res.status(400).json({
                success: false,
                message:
                    "Approver ID is required.",
            });
        }

        if (
            !remarks ||
            String(remarks).trim() === ""
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Rejection remarks are required.",
            });
        }

        const client =
            await pool.connect();

        try {
            await client.query(
                "BEGIN"
            );

            /* =========================================
               VERIFY APPROVER
            ========================================= */

            const userResult =
                await client.query(
                    `
                    SELECT
                        u.id,
                        u.full_name,
                        u.username,
                        u.is_active,
                        r.role_name

                    FROM users u

                    INNER JOIN roles r
                        ON r.id = u.role_id

                    WHERE u.id = $1
                    `,
                    [approver_id]
                );

            if (
                userResult.rowCount === 0
            ) {
                throw new Error(
                    "Approver was not found."
                );
            }

            const approver =
                userResult.rows[0];

            if (!approver.is_active) {
                throw new Error(
                    "Approver account is inactive."
                );
            }

            /* =========================================
               LOCK BOOKING
            ========================================= */

            const bookingResult =
                await client.query(
                    `
                    SELECT
                        id,
                        booking_reference,
                        booking_status,
                        approval_status,
                        guest_type,
                        acceptance_status

                    FROM bookings

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [bookingId]
                );

            if (
                bookingResult.rowCount === 0
            ) {
                throw new Error(
                    "Booking not found."
                );
            }

            const booking =
                bookingResult.rows[0];

            if (
                !req.authUser ||
                req.authUser.id !== approver_id
            ) {
                throw new Error(
                    "The authenticated approver identity does not match this request."
                );
            }

            if (
                booking.approval_status !==
                "PENDING"
            ) {
                throw new Error(
                    `This booking is already ${String(
                        booking.approval_status
                    ).toLowerCase()}.`
                );
            }

            /* =========================================
               VERIFY RESPONSIBLE AUTHORITY
            ========================================= */

            const permissionResult =
                await client.query(
                    `
                    SELECT DISTINCT
                        r.id AS room_id,
                        r.room_number,
                        rp.role_name

                    FROM booking_acceptances ba

                    INNER JOIN rooms r
                        ON r.id = ba.room_id

                    LEFT JOIN LATERAL (
                        SELECT role_name
                        FROM room_permissions
                        WHERE room_id = r.id
                            AND can_approve = TRUE
                        ORDER BY role_name
                        LIMIT 1
                    ) rp ON TRUE

                    WHERE
                        ba.booking_id = $1

                        AND ba.acceptance_status =
                            'ACCEPTED'

                        AND COALESCE(
                            ba.approval_authority_role,
                            rp.role_name
                        ) = $2
                    `,
                    [
                        bookingId,
                        approver.role_name,
                    ]
                );

            if (
                permissionResult.rowCount === 0
            ) {
                throw new Error(
                    "You are not the responsible authority for the accepted accommodation."
                );
            }

            /* =========================================
               VERIFY ALL ACCEPTED ROOMS

               Same authority must handle the whole
               accepted booking.
            ========================================= */

            const allAcceptedResult =
                await client.query(
                    `
                    SELECT
                        ba.id,
                        ba.room_id,
                        r.room_number,

                        COALESCE(
                            ba.approval_authority_role,
                            rp.role_name,
                            ''
                        ) AS responsible_role

                    FROM booking_acceptances ba

                    INNER JOIN rooms r
                        ON r.id = ba.room_id

                    LEFT JOIN LATERAL (
                        SELECT
                            role_name
                        FROM room_permissions
                        WHERE
                            room_id = r.id
                            AND can_approve = TRUE
                        ORDER BY role_name
                        LIMIT 1
                    ) rp
                        ON TRUE

                    WHERE
                        ba.booking_id = $1
                        AND ba.acceptance_status =
                            'ACCEPTED'
                    `,
                    [bookingId]
                );

            if (
                allAcceptedResult.rowCount === 0
            ) {
                throw new Error(
                    "No accepted accommodation found for this booking."
                );
            }

            const unauthorizedRooms =
                allAcceptedResult.rows.filter(
                    (row) =>
                        row.responsible_role !==
                        approver.role_name
                );

            if (
                unauthorizedRooms.length > 0
            ) {
                const roomNames =
                    unauthorizedRooms
                        .map(
                            (row) =>
                                row.room_number
                        )
                        .join(", ");

                throw new Error(
                    `This booking contains accommodation requiring another responsible authority: ${roomNames}.`
                );
            }

            /* =========================================
               UPDATE / CREATE APPROVAL RECORD
            ========================================= */

            const existingApprovalResult =
                await client.query(
                    `
                    SELECT
                        id

                    FROM booking_approvals

                    WHERE
                        booking_id = $1
                        AND approver_id = $2
                        AND approval_status = 'PENDING'

                    ORDER BY
                        created_at DESC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        bookingId,
                        approver_id,
                    ]
                );

            let approval;

            if (
                (existingApprovalResult.rowCount ?? 0) >
                0
            ) {
                const updateResult =
                    await client.query(
                        `
                        UPDATE booking_approvals

                        SET
                            approval_status =
                                'REJECTED',

                            remarks = $3,

                            approved_at =
                                CURRENT_TIMESTAMP

                        WHERE
                            id = $1
                            AND booking_id = $2

                        RETURNING
                            id,
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at,
                            created_at
                        `,
                        [
                            existingApprovalResult
                                .rows[0]
                                .id,

                            bookingId,

                            String(
                                remarks
                            ).trim(),
                        ]
                    );

                approval =
                    updateResult.rows[0];
            } else {
                const insertResult =
                    await client.query(
                        `
                        INSERT INTO booking_approvals (
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at
                        )

                        VALUES (
                            $1,
                            $2,
                            'REJECTED',
                            $3,
                            CURRENT_TIMESTAMP
                        )

                        RETURNING
                            id,
                            booking_id,
                            approver_id,
                            approval_status,
                            remarks,
                            approved_at,
                            created_at
                        `,
                        [
                            bookingId,
                            approver_id,

                            String(
                                remarks
                            ).trim(),
                        ]
                    );

                approval =
                    insertResult.rows[0];
            }

            /* =========================================
               REJECT ACCEPTANCES

               Physical room/bed was never locked.
            ========================================= */

            await client.query(
                `
                UPDATE booking_acceptances

                SET
                    acceptance_status =
                        'REJECTED',

                    remarks =
                        CONCAT(
                            COALESCE(remarks, ''),
                            CASE
                                WHEN COALESCE(
                                    remarks,
                                    ''
                                ) = ''
                                THEN ''
                                ELSE ' | '
                            END,
                            'Booking rejected: ',
                            $2
                        )

                WHERE
                    booking_id = $1
                    AND acceptance_status =
                        'ACCEPTED'
                `,
                [
                    bookingId,
                    String(
                        remarks
                    ).trim(),
                ]
            );

            /* =========================================
               UPDATE BOOKING
            ========================================= */

            await client.query(
                `
                UPDATE bookings

                SET
                    approval_status =
                        'REJECTED',

                    booking_status =
                        'REJECTED',

                    acceptance_status =
                        'REJECTED',

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [bookingId]
            );

            await client.query(
                "COMMIT"
            );

            return res.status(200).json({
                success: true,

                message:
                    "Booking rejected successfully.",

                booking: {
                    id:
                        booking.id,

                    booking_reference:
                        booking.booking_reference,

                    booking_status:
                        "REJECTED",

                    approval_status:
                        "REJECTED",

                    acceptance_status:
                        "REJECTED",
                },

                approval,
            });
        } catch (error) {
            await client.query(
                "ROLLBACK"
            );

            console.error(
                "Reject booking error:",
                error
            );

            const message =
                error instanceof Error
                    ? error.message
                    : "Unable to reject booking.";

            return res.status(400).json({
                success: false,
                message,
            });
        } finally {
            client.release();
        }
    }
);

export default router;