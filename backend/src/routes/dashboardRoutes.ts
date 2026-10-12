import { Router } from "express";
import { pool } from "../config/db.js";
import {
  type DailyReportType,
  buildLiveDailyReportSnapshot,
  getUpcomingAdvanceBookings,
  persistDailyReportSnapshot,
} from "../services/dailyReport.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| DASHBOARD SUMMARY
|--------------------------------------------------------------------------
| All dashboard figures are calculated from PostgreSQL.
|--------------------------------------------------------------------------
*/

router.get("/summary", async (req, res) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | MAIN STATISTICS
    |--------------------------------------------------------------------------
    */

    const summaryResult = await pool.query(`
      SELECT

        /* Total bookings in the system */
        (
          SELECT COUNT(*)
          FROM bookings
        )::INTEGER AS total_bookings,


        /* Beds which are genuinely available */
        (
          SELECT COUNT(*)
          FROM beds b
          INNER JOIN rooms r
            ON r.id = b.room_id
          WHERE
            b.is_active = TRUE
            AND r.is_active = TRUE
            AND r.room_usage = 'GUEST'
            AND r.is_under_maintenance = FALSE
            AND UPPER(b.bed_status) = 'AVAILABLE'
        )::INTEGER AS available_beds,


        /* Beds currently occupied */
        (
          SELECT COUNT(*)
          FROM beds b
          INNER JOIN rooms r
            ON r.id = b.room_id
          WHERE
            b.is_active = TRUE
            AND r.is_active = TRUE
            AND r.room_usage = 'GUEST'
            AND (
              UPPER(b.bed_status) = 'OCCUPIED'
              OR (
                UPPER(b.bed_status) = 'BOOKED'
                AND EXISTS (
                  SELECT 1
                  FROM allotments a
                  INNER JOIN check_ins ci
                    ON ci.allotment_id = a.id
                  WHERE
                    a.room_id = r.id
                    AND a.bed_id IS NULL
                    AND a.allotment_status = 'ALLOTTED'
                    AND ci.check_in_time <=
                      (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
                    AND NOT EXISTS (
                      SELECT 1
                      FROM check_outs co
                      WHERE
                        co.allotment_id = a.id
                        AND co.check_out_time <=
                          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')
                    )
                )
              )
            )
        )::INTEGER AS occupied_beds,


        /* Guests who actually checked in today */
        (
          SELECT COUNT(*)
          FROM check_ins ci
          WHERE
            DATE(ci.check_in_time) =
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
        )::INTEGER AS todays_check_ins,


        /* Beds and room-only allotments waiting for housekeeping */
        (
          (
            SELECT COUNT(*)
            FROM beds b
            INNER JOIN rooms r
              ON r.id = b.room_id
            WHERE
              b.is_active = TRUE
              AND r.is_active = TRUE
              AND r.room_usage = 'GUEST'
              AND UPPER(b.bed_status) = 'NEEDS_CLEANING'
          ) +
          (
            SELECT COUNT(*)
            FROM (
              SELECT DISTINCT ON (a.room_id)
                UPPER(REPLACE(ht.task_status, ' ', '_'))
                  AS task_status
              FROM housekeeping_tasks ht
              INNER JOIN allotments a
                ON a.id = ht.allotment_id
              INNER JOIN rooms r
                ON r.id = a.room_id
              WHERE
                a.bed_id IS NULL
                AND r.is_active = TRUE
              ORDER BY
                a.room_id,
                ht.assigned_at DESC,
                ht.id DESC
            ) latest_room_tasks
            WHERE task_status = 'NEEDS_CLEANING'
          )
        )::INTEGER AS needs_cleaning_beds,


        /* Beds and room-only allotments currently being cleaned */
        (
          (
            SELECT COUNT(*)
            FROM beds b
            INNER JOIN rooms r
              ON r.id = b.room_id
            WHERE
              b.is_active = TRUE
              AND r.is_active = TRUE
              AND r.room_usage = 'GUEST'
              AND UPPER(b.bed_status) = 'CLEANING'
          ) +
          (
            SELECT COUNT(*)
            FROM (
              SELECT DISTINCT ON (a.room_id)
                UPPER(REPLACE(ht.task_status, ' ', '_'))
                  AS task_status
              FROM housekeeping_tasks ht
              INNER JOIN allotments a
                ON a.id = ht.allotment_id
              INNER JOIN rooms r
                ON r.id = a.room_id
              WHERE
                a.bed_id IS NULL
                AND r.is_active = TRUE
              ORDER BY
                a.room_id,
                ht.assigned_at DESC,
                ht.id DESC
            ) latest_room_tasks
            WHERE task_status = 'CLEANING'
          )
        )::INTEGER AS cleaning_beds

    `);


    /*
    |--------------------------------------------------------------------------
    | ROOM CATEGORY COUNTS
    |--------------------------------------------------------------------------
    */

    const roomCategoryResult = await pool.query(`
      SELECT
        LOWER(TRIM(rc.category_name)) AS category_name,
        COUNT(r.id)::INTEGER AS room_count
      FROM rooms r
      INNER JOIN room_categories rc
        ON rc.id = r.category_id
      WHERE
        r.is_active = TRUE
        AND r.room_usage = 'GUEST'
      GROUP BY
        LOWER(TRIM(rc.category_name))
      ORDER BY
        LOWER(TRIM(rc.category_name))
    `);

    /*
    |--------------------------------------------------------------------------
    | RECENT BOOKINGS
    |--------------------------------------------------------------------------
    */

    const recentBookingsResult = await pool.query(`
      SELECT
        b.id,
        b.booking_reference,
        b.booking_status,
        b.approval_status,
        b.booking_type,
        b.check_in_date,
        b.expected_check_out_date,
        b.created_at,
        (
          (b.created_by = $1 OR $2 = 'ADMIN')
          AND b.booking_status = 'PENDING_APPROVAL'
          AND b.approval_status = 'PENDING'
          AND NOT EXISTS (
            SELECT 1 FROM payments p WHERE p.booking_id = b.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM allotments a WHERE a.booking_id = b.id
          )
        ) AS can_delete,
        CASE
          WHEN
            (
              b.created_by = $1
              OR $2 IN ('ADMIN', 'RECEPTIONIST')
            )
            AND b.booking_status = 'PENDING_APPROVAL'
            AND b.approval_status = 'APPROVED'
            AND accepted.accepted_guest_count =
              b.number_of_guests
            AND pricing.booking_id IS NOT NULL
          THEN
            CASE
              WHEN latest_payment.id IS NULL
                THEN 'PAYMENT'
              WHEN latest_invoice.id IS NULL
                THEN 'INVOICE'
              WHEN NOT EXISTS (
                SELECT 1
                FROM allotments a
                WHERE a.booking_id = b.id
                  AND a.allotment_status = 'ALLOTTED'
              )
                THEN 'ROOM_LOCKED'
              ELSE NULL
            END
          WHEN
            (b.created_by = $1 OR $2 = 'ADMIN')
            AND b.booking_status = 'PENDING_APPROVAL'
            AND b.approval_status = 'PENDING'
            AND NOT EXISTS (
              SELECT 1 FROM payments p WHERE p.booking_id = b.id
            )
          THEN
            CASE
              WHEN accepted.accepted_guest_count < b.number_of_guests
                THEN 'AVAILABILITY'
              WHEN
                wp.current_step = 'COMPLETED'
                AND pricing.booking_id IS NOT NULL
                THEN 'BOOKING_CONFIRMATION'
              WHEN wp.current_step = 'AVAILABILITY'
                THEN 'AVAILABILITY'
              WHEN wp.current_step = 'RATE'
                THEN 'RATE'
              WHEN wp.current_step = 'GUEST_TYPE'
                THEN 'GUEST_TYPE'
              WHEN
                wp.current_step = 'BOOKING_CONFIRMATION'
                AND pricing.booking_id IS NOT NULL
                THEN 'BOOKING_CONFIRMATION'
              WHEN pricing.booking_id IS NULL
                THEN 'GUEST_TYPE'
              ELSE NULL
            END
          ELSE NULL
        END AS resume_step,

        COALESCE(
          primary_guest.guest_name,
          'Guest not assigned'
        ) AS guest_name,

        COALESCE(
          allotted_room.room_number,
          'Not allotted'
        ) AS room_number

      FROM bookings b
      LEFT JOIN booking_workflow_progress wp
        ON wp.booking_id = b.id
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT ba.guest_id)::INTEGER AS accepted_guest_count
        FROM booking_acceptances ba
        WHERE
          ba.booking_id = b.id
          AND ba.acceptance_status = 'ACCEPTED'
      ) accepted ON TRUE
      LEFT JOIN booking_pricing pricing
        ON pricing.booking_id = b.id
      LEFT JOIN LATERAL (
        SELECT
          p.id
        FROM payments p
        WHERE p.booking_id = b.id
        ORDER BY p.created_at DESC
        LIMIT 1
      ) latest_payment ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          bi.id
        FROM booking_invoices bi
        WHERE bi.payment_id = latest_payment.id
        ORDER BY bi.created_at DESC
        LIMIT 1
      ) latest_invoice ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          g.guest_name
        FROM booking_guests bg
        INNER JOIN guests g
          ON g.id = bg.guest_id
        WHERE
          bg.booking_id = b.id
        ORDER BY
          bg.is_primary_guest DESC,
          bg.created_at ASC
        LIMIT 1
      ) primary_guest
        ON TRUE

      LEFT JOIN LATERAL (
        SELECT
          r.room_number
        FROM allotments a
        INNER JOIN rooms r
          ON r.id = a.room_id
        WHERE
          a.booking_id = b.id
        ORDER BY
          CASE
            WHEN a.allotment_status = 'ALLOTTED'
              THEN 0
            WHEN a.allotment_status = 'RELEASED'
              THEN 1
            ELSE 2
          END,
          a.allotted_at DESC
        LIMIT 1
      ) allotted_room
        ON TRUE

      WHERE
        b.created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        AND b.created_at <= CURRENT_TIMESTAMP

      ORDER BY
        b.created_at DESC
    `, [req.authUser?.id, req.authUser?.role]);


    /*
    |--------------------------------------------------------------------------
    | NORMALISE ROOM CATEGORIES
    |--------------------------------------------------------------------------
    */

    let acRooms = 0;
    let vipRooms = 0;
    let nonAcRooms = 0;
    let dormitories = 0;
    let hallRooms = 0;

    for (const row of roomCategoryResult.rows) {
      const category = String(
        row.category_name || ""
      )
        .toLowerCase()
        .replace(/[\s_-]/g, "");

      const count = Number(
        row.room_count || 0
      );

      if (category === "ac") {
        acRooms += count;
      } else if (category === "vip") {
        vipRooms += count;
      } else if (
        category === "nac" ||
        category === "nonac" ||
        category === "nonairconditioned"
      ) {
        nonAcRooms += count;
      } else if (
        category === "dorm" ||
        category === "dormitory" ||
        category === "dormitories"
      ) {
        dormitories += count;
      } else if (
        category === "hall"
      ) {
        hallRooms += count;
      }
    }


    const summary = summaryResult.rows[0];


    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    res.json({
      success: true,

      summary: {
        totalBookings:
          Number(summary.total_bookings || 0),

        availableBeds:
          Number(summary.available_beds || 0),

        occupiedBeds:
          Number(summary.occupied_beds || 0),

        todaysCheckIns:
          Number(summary.todays_check_ins || 0),

        needsCleaningBeds:
          Number(summary.needs_cleaning_beds || 0),

        cleaningBeds:
          Number(summary.cleaning_beds || 0),
      },

      roomStatus: {
        acRooms,
        vipRooms,
        nonAcRooms,
        dormitories,
        hallRooms,
      },

      recentBookings:
        recentBookingsResult.rows,
    });

  } catch (error) {

    console.error(
      "Error loading dashboard summary:",
      error
    );

    res.status(500).json({
      success: false,
      message:
        "Unable to load dashboard information.",
    });
  }
});

router.get("/collections", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can view collection summaries.",
    });
  }

  try {
    const constraintResult = await pool.query(
      `
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname = 'payments_status_check'
        AND conrelid = 'payments'::regclass
      LIMIT 1
      `
    );
    const constraint = constraintResult.rows[0]?.definition;
    if (typeof constraint !== "string") {
      throw new Error("payments_status_check constraint was not found.");
    }
    const allowedStatuses = (constraint.match(/'([^']+)'/g) ?? [])
      .map((value: string) => value.slice(1, -1));
    const successfulStatus = [
      "SUCCESS",
      "COMPLETED",
      "PAID",
      "RECEIVED",
    ].find((status) => allowedStatuses.includes(status));
    if (!successfulStatus) {
      throw new Error(
        `No successful payment status was found. Allowed statuses: ${allowedStatuses.join(", ")}`
      );
    }

    const result = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE payment_date::date = CURRENT_DATE
        ), 0) AS today_total,
        COALESCE(SUM(amount) FILTER (
          WHERE payment_date::date = CURRENT_DATE
            AND payment_method = 'CASH'
        ), 0) AS today_cash,
        COALESCE(SUM(amount) FILTER (
          WHERE payment_date::date = CURRENT_DATE
            AND payment_method = 'UPI'
        ), 0) AS today_upi_qr,
        COALESCE(SUM(amount) FILTER (
          WHERE payment_date::date = CURRENT_DATE
            AND payment_method NOT IN ('CASH', 'UPI')
        ), 0) AS today_other,
        COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', payment_date::date) =
                DATE_TRUNC('month', CURRENT_DATE)
            AND payment_method = 'CASH'
        ), 0) AS month_cash,
        COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', payment_date::date) =
                DATE_TRUNC('month', CURRENT_DATE)
            AND payment_method = 'UPI'
        ), 0) AS month_upi_qr,
        COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', payment_date::date) =
                DATE_TRUNC('month', CURRENT_DATE)
            AND payment_method NOT IN ('CASH', 'UPI')
        ), 0) AS month_other,
        COALESCE(SUM(amount) FILTER (
          WHERE DATE_TRUNC('month', payment_date::date) =
                DATE_TRUNC('month', CURRENT_DATE)
        ), 0) AS month_total
      FROM payments
      WHERE payment_status = $1
      `,
      [successfulStatus]
    );
    const row = result.rows[0];
    return res.json({
      success: true,
      collections: {
        todayTotal: Number(row.today_total),
        todayCash: Number(row.today_cash),
        todayUpiQr: Number(row.today_upi_qr),
        todayOther: Number(row.today_other),
        monthCash: Number(row.month_cash),
        monthUpiQr: Number(row.month_upi_qr),
        monthOther: Number(row.month_other),
        monthTotal: Number(row.month_total),
      },
    });
  } catch (error) {
    console.error("Dashboard collection summary error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load collection summaries.",
    });
  }
});

router.get("/monthly-payment-transactions", async (req, res) => {
  const reportDate = String(req.query.date ?? "");
  const paymentMethod = String(req.query.method ?? "").toUpperCase();
  const parsedDate = new Date(`${reportDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== reportDate
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid report date in YYYY-MM-DD format is required.",
    });
  }
  if (paymentMethod !== "CASH" && paymentMethod !== "UPI") {
    return res.status(400).json({
      success: false,
      message: "Payment method must be CASH or UPI.",
    });
  }

  try {
    const result = await pool.query<{
      payment_date: string;
      payment_time: string;
      booking_reference: string;
      guest_name: string;
      amount: string | number;
      total: string | number;
    }>(
      `
      SELECT
        p.payment_date::TEXT AS payment_date,
        COALESCE(TO_CHAR(p.created_at, 'HH12:MI AM'), '—') AS payment_time,
        b.booking_reference,
        COALESCE(primary_guest.guest_name, 'Guest not assigned') AS guest_name,
        p.amount,
        SUM(p.amount) OVER () AS total
      FROM payments p
      INNER JOIN bookings b
        ON b.id = p.booking_id
      LEFT JOIN LATERAL (
        SELECT g.guest_name
        FROM booking_guests bg
        INNER JOIN guests g
          ON g.id = bg.guest_id
        WHERE bg.booking_id = p.booking_id
        ORDER BY bg.is_primary_guest DESC, bg.created_at ASC
        LIMIT 1
      ) primary_guest
        ON TRUE
      WHERE
        p.payment_date >= DATE_TRUNC('month', $1::DATE)::DATE
        AND p.payment_date <
          (DATE_TRUNC('month', $1::DATE) + INTERVAL '1 month')::DATE
        AND UPPER(p.payment_method) = $2
        AND UPPER(p.payment_status) IN ('SUCCESS', 'COMPLETED', 'PAID', 'RECEIVED')
      ORDER BY
        p.payment_date ASC,
        p.created_at ASC,
        p.id ASC
      `,
      [reportDate, paymentMethod]
    );

    const transactions = result.rows.map((row) => ({
      paymentDate: row.payment_date,
      paymentTime: row.payment_time,
      bookingReference: row.booking_reference,
      guestName: row.guest_name,
      amount: Number(row.amount),
    }));

    return res.json({
      success: true,
      method: paymentMethod,
      transactions,
      total: result.rows.length > 0 ? Number(result.rows[0].total) : 0,
    });
  } catch (error) {
    console.error("Monthly payment transactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load monthly payment transactions.",
    });
  }
});

router.get("/annual-report", async (req, res) => {
  try {
    const currentYearResult = await pool.query<{ current_fy_start: number }>(`
      SELECT CASE
        WHEN EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) >= 4
          THEN EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'))
        ELSE EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')) - 1
      END::INTEGER AS current_fy_start
    `);
    const currentFinancialYearStart = currentYearResult.rows[0].current_fy_start;
    const requestedYear = Number(req.query.start_year ?? currentFinancialYearStart);

    if (
      !Number.isInteger(requestedYear) ||
      requestedYear < 2000 ||
      requestedYear > currentFinancialYearStart
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid financial year start year is required.",
      });
    }

    const periodStart = `${requestedYear}-04-01`;
    const periodEnd = `${requestedYear + 1}-04-01`;
    const result = await pool.query<{
      month_start: string;
      cash_total: string | number;
      upi_total: string | number;
      total_collection: string | number;
      checkin_male: string | number;
      checkin_female: string | number;
      checkin_children: string | number;
      checkin_total: string | number;
      checkout_male: string | number;
      checkout_female: string | number;
      checkout_children: string | number;
      checkout_total: string | number;
      annual_cash_total: string | number;
      annual_upi_total: string | number;
      annual_total_collection: string | number;
      annual_checkin_male: string | number;
      annual_checkin_female: string | number;
      annual_checkin_children: string | number;
      annual_checkin_total: string | number;
      annual_checkout_male: string | number;
      annual_checkout_female: string | number;
      annual_checkout_children: string | number;
      annual_checkout_total: string | number;
    }>(
      `
      WITH months AS (
        SELECT generate_series(
          $1::DATE,
          ($2::DATE - INTERVAL '1 month')::DATE,
          INTERVAL '1 month'
        )::DATE AS month_start
      ), payment_totals AS (
        SELECT
          DATE_TRUNC('month', p.payment_date)::DATE AS month_start,
          COALESCE(SUM(p.amount) FILTER (
            WHERE UPPER(p.payment_method) = 'CASH'
          ), 0)::NUMERIC(12, 2) AS cash_total,
          COALESCE(SUM(p.amount) FILTER (
            WHERE UPPER(p.payment_method) = 'UPI'
          ), 0)::NUMERIC(12, 2) AS upi_total
        FROM payments p
        WHERE
          p.payment_date >= $1::DATE
          AND p.payment_date < $2::DATE
          AND UPPER(p.payment_status) IN ('SUCCESS', 'COMPLETED', 'PAID', 'RECEIVED')
          AND UPPER(p.payment_method) IN ('CASH', 'UPI')
        GROUP BY DATE_TRUNC('month', p.payment_date)::DATE
      ), guest_events AS (
        SELECT
          'CHECK_IN'::TEXT AS event_type,
          ci.check_in_time AS event_time,
          g.gender,
          g.date_of_birth
        FROM check_ins ci
        INNER JOIN guests g ON g.id = ci.guest_id
        WHERE ci.check_in_time >= $1::DATE
          AND ci.check_in_time < $2::DATE

        UNION ALL

        SELECT
          'CHECK_OUT'::TEXT AS event_type,
          co.check_out_time AS event_time,
          g.gender,
          g.date_of_birth
        FROM check_outs co
        INNER JOIN guests g ON g.id = co.guest_id
        WHERE co.check_out_time >= $1::DATE
          AND co.check_out_time < $2::DATE
      ), guest_totals AS (
        SELECT
          DATE_TRUNC('month', event_time)::DATE AS month_start,
          event_type,
          COUNT(*) FILTER (
            WHERE date_of_birth IS NOT NULL
              AND date_of_birth > event_time::DATE - INTERVAL '12 years'
              AND date_of_birth <= event_time::DATE
          )::INTEGER AS children,
          COUNT(*) FILTER (
            WHERE (date_of_birth IS NULL
                OR date_of_birth <= event_time::DATE - INTERVAL '12 years')
              AND UPPER(COALESCE(gender, '')) = 'MALE'
          )::INTEGER AS male,
          COUNT(*) FILTER (
            WHERE (date_of_birth IS NULL
                OR date_of_birth <= event_time::DATE - INTERVAL '12 years')
              AND UPPER(COALESCE(gender, '')) = 'FEMALE'
          )::INTEGER AS female,
          COUNT(*)::INTEGER AS guests
        FROM guest_events
        GROUP BY DATE_TRUNC('month', event_time)::DATE, event_type
      ), monthly AS (
        SELECT
          months.month_start,
          COALESCE(payment_totals.cash_total, 0)::NUMERIC(12, 2) AS cash_total,
          COALESCE(payment_totals.upi_total, 0)::NUMERIC(12, 2) AS upi_total,
          (
            COALESCE(payment_totals.cash_total, 0)
            + COALESCE(payment_totals.upi_total, 0)
          )::NUMERIC(12, 2) AS total_collection,
          COALESCE(checkins.male, 0)::INTEGER AS checkin_male,
          COALESCE(checkins.female, 0)::INTEGER AS checkin_female,
          COALESCE(checkins.children, 0)::INTEGER AS checkin_children,
          COALESCE(checkins.guests, 0)::INTEGER AS checkin_total,
          COALESCE(checkouts.male, 0)::INTEGER AS checkout_male,
          COALESCE(checkouts.female, 0)::INTEGER AS checkout_female,
          COALESCE(checkouts.children, 0)::INTEGER AS checkout_children,
          COALESCE(checkouts.guests, 0)::INTEGER AS checkout_total
        FROM months
        LEFT JOIN payment_totals
          ON payment_totals.month_start = months.month_start
        LEFT JOIN guest_totals checkins
          ON checkins.month_start = months.month_start
         AND checkins.event_type = 'CHECK_IN'
        LEFT JOIN guest_totals checkouts
          ON checkouts.month_start = months.month_start
         AND checkouts.event_type = 'CHECK_OUT'
      )
      SELECT
        TO_CHAR(monthly.month_start, 'YYYY-MM-DD') AS month_start,
        monthly.cash_total,
        monthly.upi_total,
        monthly.total_collection,
        monthly.checkin_male,
        monthly.checkin_female,
        monthly.checkin_children,
        monthly.checkin_total,
        monthly.checkout_male,
        monthly.checkout_female,
        monthly.checkout_children,
        monthly.checkout_total,
        SUM(cash_total) OVER ()::NUMERIC(12, 2) AS annual_cash_total,
        SUM(upi_total) OVER ()::NUMERIC(12, 2) AS annual_upi_total,
        SUM(total_collection) OVER ()::NUMERIC(12, 2) AS annual_total_collection,
        SUM(checkin_male) OVER ()::INTEGER AS annual_checkin_male,
        SUM(checkin_female) OVER ()::INTEGER AS annual_checkin_female,
        SUM(checkin_children) OVER ()::INTEGER AS annual_checkin_children,
        SUM(checkin_total) OVER ()::INTEGER AS annual_checkin_total,
        SUM(checkout_male) OVER ()::INTEGER AS annual_checkout_male,
        SUM(checkout_female) OVER ()::INTEGER AS annual_checkout_female,
        SUM(checkout_children) OVER ()::INTEGER AS annual_checkout_children,
        SUM(checkout_total) OVER ()::INTEGER AS annual_checkout_total
      FROM monthly
      ORDER BY month_start
      `,
      [periodStart, periodEnd]
    );

    const monthly = result.rows.map((row) => ({
      monthStart: row.month_start,
      cashTotal: Number(row.cash_total),
      upiTotal: Number(row.upi_total),
      totalCollection: Number(row.total_collection),
      checkIns: {
        male: Number(row.checkin_male),
        female: Number(row.checkin_female),
        children: Number(row.checkin_children),
        total: Number(row.checkin_total),
      },
      checkOuts: {
        male: Number(row.checkout_male),
        female: Number(row.checkout_female),
        children: Number(row.checkout_children),
        total: Number(row.checkout_total),
      },
    }));
    const totals = result.rows[0];
    const upcomingAdvanceBookings =
      await getUpcomingAdvanceBookings(pool);

    return res.json({
      success: true,
      financialYearStart: requestedYear,
      periodStart,
      periodEnd: `${requestedYear + 1}-03-31`,
      monthly,
      totals: {
        cash: Number(totals?.annual_cash_total ?? 0),
        upi: Number(totals?.annual_upi_total ?? 0),
        totalCollection: Number(totals?.annual_total_collection ?? 0),
        checkIns: {
          male: Number(totals?.annual_checkin_male ?? 0),
          female: Number(totals?.annual_checkin_female ?? 0),
          children: Number(totals?.annual_checkin_children ?? 0),
          total: Number(totals?.annual_checkin_total ?? 0),
        },
        checkOuts: {
          male: Number(totals?.annual_checkout_male ?? 0),
          female: Number(totals?.annual_checkout_female ?? 0),
          children: Number(totals?.annual_checkout_children ?? 0),
          total: Number(totals?.annual_checkout_total ?? 0),
        },
      },
      upcomingAdvanceBookings,
    });
  } catch (error) {
    console.error("Annual report error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load the annual financial report.",
    });
  }
});

router.get("/daily-report", async (req, res) => {
  const reportDate = String(req.query.date ?? "");
  const requestedType = String(req.query.period ?? "daily").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY"].includes(requestedType)) {
    return res.status(400).json({
      success: false,
      message: "Report period must be daily, weekly, or monthly.",
    });
  }
  const reportType = requestedType as DailyReportType;
  const parsedDate = new Date(`${reportDate}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== reportDate
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid report date in YYYY-MM-DD format is required.",
    });
  }

  try {
    const scheduleResult = await pool.query<{
      today: string;
      report_due: boolean;
      normalized_report_date: string;
    }>(`
      SELECT
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE::TEXT AS today,
        (
          CASE $2::TEXT
            WHEN 'WEEKLY' THEN
              (date_trunc('week', $1::DATE)::DATE + 6)
            WHEN 'MONTHLY' THEN
              (date_trunc('month', $1::DATE) + INTERVAL '1 month - 1 day')::DATE
            ELSE $1::DATE
          END
          < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
          OR (
            CASE $2::TEXT
              WHEN 'WEEKLY' THEN
                (date_trunc('week', $1::DATE)::DATE + 6)
              WHEN 'MONTHLY' THEN
                (date_trunc('month', $1::DATE) + INTERVAL '1 month - 1 day')::DATE
              ELSE $1::DATE
            END =
              (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
            AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::TIME
              >= TIME '21:00'
          )
        ) AS report_due,
        CASE $2::TEXT
          WHEN 'WEEKLY' THEN
            (date_trunc('week', $1::DATE)::DATE + 6)::TEXT
          WHEN 'MONTHLY' THEN
            (date_trunc('month', $1::DATE) + INTERVAL '1 month - 1 day')::DATE::TEXT
          ELSE $1::DATE::TEXT
        END AS normalized_report_date
    `, [reportDate, reportType]);
    const {
      today,
      report_due: reportDue,
      normalized_report_date: normalizedReportDate,
    } = scheduleResult.rows[0];
    if (reportDate > today) {
      return res.status(400).json({
        success: false,
        message: "The daily report date cannot be in the future.",
      });
    }
    const savedResult = await pool.query<{
      snapshot: Awaited<ReturnType<typeof persistDailyReportSnapshot>>;
    }>(
      `
      SELECT snapshot
      FROM daily_report_snapshots
      WHERE report_type = $1
        AND report_date = $2::DATE
      `,
      [reportType, normalizedReportDate]
    );

    const snapshot =
      savedResult.rows[0]?.snapshot ??
      (reportDue
        ? await persistDailyReportSnapshot(normalizedReportDate, reportType)
        : await buildLiveDailyReportSnapshot(reportDate, reportType));

    const { feedback, ...reportData } = snapshot;
    const upcomingAdvanceBookings =
      await getUpcomingAdvanceBookings(pool);
    return res.json({
      success: true,
      ...reportData,
      upcomingAdvanceBookings,
      feedback: req.authUser?.role === "ADMIN" ? feedback : [],
      snapshotSaved: Boolean(savedResult.rows[0]) || reportDue,
    });
  } catch (error) {
    console.error("Daily report load error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load the daily report.",
    });
  }
});

export default router;