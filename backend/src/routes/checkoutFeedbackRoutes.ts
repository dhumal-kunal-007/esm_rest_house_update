import { Router, type Request, type Response } from "express";
import { pool } from "../config/db.js";
import { areCheckoutFeedbackRatingsValid } from "../services/checkoutFeedback.js";

const router = Router();

const ratingFields = [
  "staff_rating",
  "housekeeping_rating",
  "facilities_rating",
  "food_rating",
  "overall_rating",
] as const;

router.get(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    if (req.authUser?.role !== "ADMIN") {
      res.status(403).json({
        success: false,
        message: "Only an ADMIN can view checkout feedback reports.",
      });
      return;
    }

    const date =
      typeof req.query.date === "string" ? req.query.date : null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({
        success: false,
        message: "Report date must use YYYY-MM-DD format.",
      });
      return;
    }

    try {
      const result = await pool.query(
        `
        SELECT
          f.booking_id,
          b.booking_reference,
          sm.full_name AS service_name,
          f.staff_rating,
          f.housekeeping_rating,
          f.facilities_rating,
          f.food_rating,
          f.overall_rating,
          f.comments,
          f.feedback_status,
          f.submitted_at
        FROM booking_checkout_feedback f
        INNER JOIN bookings b ON b.id = f.booking_id
        LEFT JOIN booking_service_members sm ON sm.booking_id = b.id
        WHERE (
          $1::date IS NULL OR
          (f.submitted_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date
        )
        ORDER BY f.submitted_at DESC
        `,
        [date]
      );

      res.json({ success: true, feedback: result.rows });
    } catch (error) {
      console.error("Checkout feedback report error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to load checkout feedback report.",
      });
    }
  }
);

router.get(
  "/:bookingId/context",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const bookingResult = await pool.query(
        `
        SELECT
          b.id,
          b.booking_reference,
          b.check_in_date::TEXT AS check_in_date,
          b.expected_check_out_date::TEXT AS expected_check_out_date,
          sm.service_number,
          sm.rank AS service_rank,
          sm.full_name AS service_name,
          COALESCE(
            json_agg(
              json_build_object(
                'name', g.guest_name,
                'relationship', g.relationship,
                'is_primary', bg.is_primary_guest
              )
              ORDER BY bg.is_primary_guest DESC, g.guest_name
            ) FILTER (WHERE g.id IS NOT NULL),
            '[]'::json
          ) AS guests,
          (
            SELECT COUNT(DISTINCT CASE
              WHEN a.bed_id IS NULL THEN a.room_id::text
              ELSE a.id::text
            END)::INTEGER
            FROM check_ins ci
            INNER JOIN allotments a ON a.id = ci.allotment_id
            LEFT JOIN check_outs co ON co.allotment_id = ci.allotment_id
            WHERE ci.booking_id = b.id AND co.id IS NULL
          ) AS remaining_checked_in_guests
        FROM bookings b
        LEFT JOIN booking_service_members sm ON sm.booking_id = b.id
        LEFT JOIN booking_guests bg ON bg.booking_id = b.id
        LEFT JOIN guests g ON g.id = bg.guest_id
        WHERE b.id = $1
        GROUP BY b.id, sm.service_number, sm.rank, sm.full_name
        `,
        [req.params.bookingId]
      );

      if (bookingResult.rowCount === 0) {
        res.status(404).json({
          success: false,
          message: "Booking was not found.",
        });
        return;
      }

      const feedbackResult = await pool.query(
        `
        SELECT
          staff_rating,
          housekeeping_rating,
          facilities_rating,
          food_rating,
          overall_rating,
          comments,
          feedback_status,
          submitted_at
        FROM booking_checkout_feedback
        WHERE booking_id = $1
        `,
        [req.params.bookingId]
      );

      res.json({
        success: true,
        context: {
          ...bookingResult.rows[0],
          is_final_guest_checkout:
            Number(bookingResult.rows[0].remaining_checked_in_guests) === 1,
          feedback: feedbackResult.rows[0] ?? null,
        },
      });
    } catch (error) {
      console.error("Checkout feedback context error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to load checkout feedback details.",
      });
    }
  }
);

router.post(
  "/:bookingId",
  async (req: Request, res: Response): Promise<void> => {
    const { skip = false, comments = null } = req.body ?? {};
    const skipped = skip === true;
    const actorId = req.authUser?.id;

    if (!actorId) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    if (
      comments !== null &&
      (typeof comments !== "string" || comments.length > 2000)
    ) {
      res.status(400).json({
        success: false,
        message: "Feedback comments must be 2,000 characters or fewer.",
      });
      return;
    }

    const ratings = ratingFields.map((field) => req.body?.[field]);
    if (
      !skipped &&
      !areCheckoutFeedbackRatingsValid(ratings)
    ) {
      res.status(400).json({
        success: false,
        message: "Choose a rating from 1 to 5 for every feedback category.",
      });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const bookingResult = await client.query(
        `
        SELECT
          b.id,
          (
            SELECT COUNT(DISTINCT CASE
              WHEN a.bed_id IS NULL THEN a.room_id::text
              ELSE a.id::text
            END)::INTEGER
            FROM check_ins ci
            INNER JOIN allotments a ON a.id = ci.allotment_id
            LEFT JOIN check_outs co ON co.allotment_id = ci.allotment_id
            WHERE ci.booking_id = b.id AND co.id IS NULL
          ) AS remaining_checked_in_guests
        FROM bookings b
        WHERE b.id = $1
        FOR UPDATE
        `,
        [req.params.bookingId]
      );

      if (bookingResult.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({
          success: false,
          message: "Booking was not found.",
        });
        return;
      }

      if (Number(bookingResult.rows[0].remaining_checked_in_guests) !== 1) {
        await client.query("ROLLBACK");
        res.status(409).json({
          success: false,
          message: "Feedback is collected only for the final guest checkout of a booking.",
        });
        return;
      }

      const result = await client.query(
        `
        INSERT INTO booking_checkout_feedback (
          booking_id,
          staff_rating,
          housekeeping_rating,
          facilities_rating,
          food_rating,
          overall_rating,
          comments,
          feedback_status,
          submitted_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (booking_id) DO UPDATE SET
          staff_rating = EXCLUDED.staff_rating,
          housekeeping_rating = EXCLUDED.housekeeping_rating,
          facilities_rating = EXCLUDED.facilities_rating,
          food_rating = EXCLUDED.food_rating,
          overall_rating = EXCLUDED.overall_rating,
          comments = EXCLUDED.comments,
          feedback_status = EXCLUDED.feedback_status,
          submitted_by = EXCLUDED.submitted_by,
          submitted_at = CURRENT_TIMESTAMP
        RETURNING
          booking_id,
          staff_rating,
          housekeeping_rating,
          facilities_rating,
          food_rating,
          overall_rating,
          comments,
          feedback_status,
          submitted_at
        `,
        [
          req.params.bookingId,
          skipped ? null : ratings[0],
          skipped ? null : ratings[1],
          skipped ? null : ratings[2],
          skipped ? null : ratings[3],
          skipped ? null : ratings[4],
          skipped ? null : comments?.trim() || null,
          skipped ? "SKIPPED" : "SUBMITTED",
          actorId,
        ]
      );

      await client.query("COMMIT");
      res.status(201).json({
        success: true,
        feedback: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Checkout feedback save error:", error);
      res.status(500).json({
        success: false,
        message: "Unable to save checkout feedback.",
      });
    } finally {
      client.release();
    }
  }
);

export default router;
