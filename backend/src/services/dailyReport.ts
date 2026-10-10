import { pool } from "../config/db.js";
import type { PoolClient, QueryResultRow } from "pg";

const businessTimeZone = "Asia/Kolkata";
type ReportDbConnection = Pick<PoolClient, "query">;
export type DailyReportType = "DAILY" | "WEEKLY" | "MONTHLY";

export interface DailyReportSnapshot {
  reportType: DailyReportType;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  rooms: Array<{
    roomId: string;
    roomNumber: string;
    category: string;
    male: number;
    female: number;
    children: number;
    otherGuests: number;
    guests: number;
    amount: number;
  }>;
  totals: {
    male: number;
    female: number;
    children: number;
    otherGuests: number;
    guests: number;
    amount: number;
  };
  summaries: {
    acVacantRooms: number;
    nonAcVacantRooms: number;
    acOccupancy: DailyReportSnapshot["totals"];
    dormitoryOccupancy: DailyReportSnapshot["totals"];
  };
  activity: Array<{
    eventType: "CHECK_IN" | "CHECK_OUT";
    eventTime: string;
    bookingReference: string;
    guestName: string;
    roomNumber: string;
    bedNumber: number | null;
    handledBy: string | null;
    remarks: string | null;
  }>;
  feedback: Array<{
    booking_id: string;
    booking_reference: string;
    service_name: string | null;
    staff_rating: number | null;
    housekeeping_rating: number | null;
    facilities_rating: number | null;
    food_rating: number | null;
    overall_rating: number | null;
    comments: string | null;
    feedback_status: "SUBMITTED" | "SKIPPED";
    submitted_at: string;
  }>;
  payments: {
    cash: number;
    upi: number;
    online: number;
    cheque: number;
    total: number;
  };
}

interface ReportDateRow extends QueryResultRow {
  report_date: string;
  period_start: Date | string;
  period_end: Date | string;
}

interface RoomReportRow extends QueryResultRow {
  room_id: string;
  room_number: string;
  category_name: string;
  male: number | string;
  female: number | string;
  children: number | string;
  other_guests: number | string;
  guests: number | string;
  amount: number | string;
}

interface ActivityReportRow extends QueryResultRow {
  event_type: "CHECK_IN" | "CHECK_OUT";
  event_time: Date | string;
  booking_reference: string;
  guest_name: string;
  room_number: string;
  bed_number: number | string | null;
  handled_by: string | null;
  remarks: string | null;
}

interface FeedbackReportRow extends QueryResultRow {
  booking_id: string;
  booking_reference: string;
  service_name: string | null;
  staff_rating: number | null;
  housekeeping_rating: number | null;
  facilities_rating: number | null;
  food_rating: number | null;
  overall_rating: number | null;
  comments: string | null;
  feedback_status: "SUBMITTED" | "SKIPPED";
  submitted_at: Date | string;
}

const toIsoString = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const normalizeCategory = (category: string): string =>
  category.toUpperCase().replace(/[\s_-]/g, "");

export interface UpcomingAdvanceBooking {
  bookingReference: string;
  serviceMember: string;
  guests: string;
  bookingStatus: string;
  approvalStatus: string;
  checkInDate: string;
  checkOutDate: string;
  roomDetails: string;
  guestCount: number;
  bookingAmount: number;
  amountPaid: number;
}

export const getUpcomingAdvanceBookings = async (
  db: ReportDbConnection = pool
): Promise<UpcomingAdvanceBooking[]> => {
  const result = await db.query<{
    booking_reference: string;
    service_member: string | null;
    guests: string | null;
    booking_status: string;
    approval_status: string;
    check_in_date: Date | string;
    check_out_date: Date | string;
    room_details: string | null;
    guest_count: number | string;
    booking_amount: number | string;
    amount_paid: number | string;
  } & QueryResultRow>(
    `
    SELECT
      b.booking_reference,
      sm.full_name AS service_member,
      guest_list.guests,
      b.booking_status,
      b.approval_status,
      b.check_in_date,
      b.expected_check_out_date AS check_out_date,
      COALESCE(allotted_rooms.room_details, accepted_rooms.room_details, 'Not allotted')
        AS room_details,
      b.number_of_guests::INTEGER AS guest_count,
      COALESCE(pricing.total_amount, 0)::NUMERIC(12, 2) AS booking_amount,
      COALESCE(paid.amount_paid, 0)::NUMERIC(12, 2) AS amount_paid
    FROM bookings b
    LEFT JOIN booking_service_members sm
      ON sm.booking_id = b.id
    LEFT JOIN booking_pricing pricing
      ON pricing.booking_id = b.id
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(g.guest_name, ', ' ORDER BY bg.is_primary_guest DESC, bg.created_at)
        AS guests
      FROM booking_guests bg
      INNER JOIN guests g ON g.id = bg.guest_id
      WHERE bg.booking_id = b.id
    ) guest_list ON TRUE
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(room_detail, ', ' ORDER BY room_detail) AS room_details
      FROM (
        SELECT DISTINCT
          r.room_number || CASE
            WHEN bd.bed_number IS NULL THEN ''
            ELSE ' / Bed ' || bd.bed_number::TEXT
          END AS room_detail
        FROM allotments a
        INNER JOIN rooms r ON r.id = a.room_id
        LEFT JOIN beds bd ON bd.id = a.bed_id
        WHERE a.booking_id = b.id
          AND a.allotment_status = 'ALLOTTED'
      ) room_assignments
    ) allotted_rooms ON TRUE
    LEFT JOIN LATERAL (
      SELECT STRING_AGG(room_detail, ', ' ORDER BY room_detail) AS room_details
      FROM (
        SELECT DISTINCT
          r.room_number || CASE
            WHEN bd.bed_number IS NULL THEN ''
            ELSE ' / Bed ' || bd.bed_number::TEXT
          END AS room_detail
        FROM booking_acceptances ba
        INNER JOIN rooms r ON r.id = ba.room_id
        LEFT JOIN beds bd ON bd.id = ba.bed_id
        WHERE ba.booking_id = b.id
          AND ba.acceptance_status = 'ACCEPTED'
      ) accepted_assignments
    ) accepted_rooms ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(p.amount)::NUMERIC(12, 2) AS amount_paid
      FROM payments p
      WHERE p.booking_id = b.id
        AND UPPER(p.payment_status) IN ('SUCCESS', 'COMPLETED', 'PAID', 'RECEIVED')
    ) paid ON TRUE
    WHERE
      UPPER(b.booking_type) = 'ADVANCE'
      AND b.check_in_date >
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE
      AND UPPER(COALESCE(b.approval_status, '')) <> 'REJECTED'
      AND UPPER(COALESCE(b.booking_status, '')) NOT LIKE '%CANCEL%'
    ORDER BY b.check_in_date, b.booking_reference
    `
  );

  return result.rows.map((row) => ({
    bookingReference: row.booking_reference,
    serviceMember: row.service_member || "—",
    guests: row.guests || "—",
    bookingStatus: row.booking_status,
    approvalStatus: row.approval_status,
    checkInDate: String(row.check_in_date).slice(0, 10),
    checkOutDate: String(row.check_out_date).slice(0, 10),
    roomDetails: row.room_details || "Not allotted",
    guestCount: Number(row.guest_count),
    bookingAmount: Number(row.booking_amount),
    amountPaid: Number(row.amount_paid),
  }));
};

const emptyTotals = () => ({
  male: 0,
  female: 0,
  children: 0,
  otherGuests: 0,
  guests: 0,
  amount: 0,
});

const summarizeRooms = (
  rooms: DailyReportSnapshot["rooms"],
  predicate: (category: string) => boolean
) =>
  rooms
    .filter((room) => predicate(normalizeCategory(room.category)))
    .reduce(
      (totals, room) => ({
        male: totals.male + room.male,
        female: totals.female + room.female,
        children: totals.children + room.children,
        otherGuests: totals.otherGuests + (room.otherGuests ?? 0),
        guests: totals.guests + room.guests,
        amount: totals.amount + room.amount,
      }),
      emptyTotals()
    );

export const buildDailyReportSnapshot = async (
  reportDate: string,
  reportType: DailyReportType = "DAILY",
  liveUntilNow = false,
  db: ReportDbConnection = pool
): Promise<DailyReportSnapshot> => {
  const periodResult = await db.query<ReportDateRow>(
    `
    SELECT
      CASE $2::TEXT
        WHEN 'WEEKLY' THEN
          (date_trunc('week', $1::DATE)::DATE + 6)::TEXT
        WHEN 'MONTHLY' THEN
          (date_trunc('month', $1::DATE) + INTERVAL '1 month - 1 day')::DATE::TEXT
        ELSE $1::DATE::TEXT
      END AS report_date,
      CASE
        WHEN $3::BOOLEAN AND $2::TEXT = 'DAILY' THEN
          CURRENT_TIMESTAMP - INTERVAL '24 hours'
        WHEN $2::TEXT = 'DAILY' THEN
          (($1::DATE + TIME '21:00') AT TIME ZONE $4::TEXT)
            - INTERVAL '24 hours'
        WHEN $2::TEXT = 'WEEKLY' THEN
          date_trunc('week', $1::DATE) AT TIME ZONE $4::TEXT
        ELSE
          date_trunc('month', $1::DATE) AT TIME ZONE $4::TEXT
      END AS period_start,
      CASE
        WHEN $3::BOOLEAN THEN
          CURRENT_TIMESTAMP
        WHEN $2::TEXT = 'WEEKLY' THEN
          (
            date_trunc('week', $1::DATE)::DATE + 6 + TIME '21:00'
          ) AT TIME ZONE $4::TEXT
        WHEN $2::TEXT = 'MONTHLY' THEN
          (
            (date_trunc('month', $1::DATE) + INTERVAL '1 month - 1 day')::DATE
            + TIME '21:00'
          ) AT TIME ZONE $4::TEXT
        ELSE
          ($1::DATE + TIME '21:00') AT TIME ZONE $4::TEXT
      END AS period_end
    `,
    [reportDate, reportType, liveUntilNow, businessTimeZone]
  );
  const period = periodResult.rows[0];
  const periodStart = toIsoString(period.period_start);
  const periodEnd = toIsoString(period.period_end);

  const roomsResult = await db.query<RoomReportRow>(
    `
    WITH report_period AS (
      SELECT
        $1::DATE AS report_date,
        $2::TIMESTAMPTZ AS period_end
    ),
    checked_in_guests AS (
      SELECT
        a.room_id,
        a.booking_id,
        g.gender,
        g.guest_category,
        g.date_of_birth,
        COALESCE(bp.total_amount, 0)::NUMERIC AS booking_amount,
        COUNT(*) OVER (PARTITION BY a.booking_id) AS booking_guest_count
      FROM check_ins ci
      INNER JOIN allotments a ON a.id = ci.allotment_id
      INNER JOIN bookings b ON b.id = a.booking_id
      INNER JOIN guests g ON g.id = ci.guest_id
      CROSS JOIN report_period rp
      LEFT JOIN booking_pricing bp ON bp.booking_id = a.booking_id
      WHERE
        b.approval_status = 'APPROVED'
        AND b.acceptance_status = 'ACCEPTED'
        AND ci.check_in_time <= rp.period_end
        AND NOT EXISTS (
          SELECT 1
          FROM check_outs co
          WHERE
            co.allotment_id = a.id
            AND co.check_out_time <= rp.period_end
        )
    ),
    room_totals AS (
      SELECT
        room_id,
        COUNT(*)::INTEGER AS guests,
        COUNT(*) FILTER (
          WHERE guest_category = 'CHILD'
             OR (
               COALESCE(guest_category, '') NOT IN ('CHILD', 'GUEST')
               AND date_of_birth IS NOT NULL
               AND date_of_birth > (
                 (SELECT report_date FROM report_period) - INTERVAL '12 years'
               )
               AND date_of_birth <= (SELECT report_date FROM report_period)
             )
        )::INTEGER AS children,
        COUNT(*) FILTER (
          WHERE
            UPPER(COALESCE(gender, '')) = 'MALE'
            AND COALESCE(guest_category, '') NOT IN ('CHILD', 'GUEST')
            AND (date_of_birth IS NULL OR date_of_birth <= (
              (SELECT report_date FROM report_period) - INTERVAL '12 years'
            ))
        )::INTEGER AS male,
        COUNT(*) FILTER (
          WHERE
            UPPER(COALESCE(gender, '')) = 'FEMALE'
            AND COALESCE(guest_category, '') NOT IN ('CHILD', 'GUEST')
            AND (date_of_birth IS NULL OR date_of_birth <= (
              (SELECT report_date FROM report_period) - INTERVAL '12 years'
            ))
        )::INTEGER AS female,
        COUNT(*) FILTER (
          WHERE guest_category = 'GUEST'
        )::INTEGER AS other_guests,
        ROUND(
          SUM(booking_amount / NULLIF(booking_guest_count, 0)),
          2
        )::NUMERIC(12, 2) AS amount
      FROM checked_in_guests
      GROUP BY room_id
    )
    SELECT
      r.id AS room_id,
      r.room_number,
      rc.category_name,
      COALESCE(rt.male, 0)::INTEGER AS male,
      COALESCE(rt.female, 0)::INTEGER AS female,
      COALESCE(rt.children, 0)::INTEGER AS children,
      COALESCE(rt.other_guests, 0)::INTEGER AS other_guests,
      COALESCE(rt.guests, 0)::INTEGER AS guests,
      COALESCE(rt.amount, 0)::NUMERIC(12, 2) AS amount
    FROM rooms r
    INNER JOIN room_categories rc ON rc.id = r.category_id
    LEFT JOIN room_totals rt ON rt.room_id = r.id
    WHERE
      r.is_active = TRUE
      AND UPPER(COALESCE(r.room_status, '')) <> 'STORE'
    ORDER BY
      CASE
        WHEN LOWER(REPLACE(REPLACE(TRIM(rc.category_name), '-', ''), ' ', ''))
          IN ('ac', 'vip', 'acvip') THEN 1
        WHEN LOWER(REPLACE(REPLACE(TRIM(rc.category_name), '-', ''), ' ', ''))
          IN ('nac', 'nonac', 'nonairconditioned') THEN 2
        WHEN LOWER(REPLACE(REPLACE(TRIM(rc.category_name), '-', ''), ' ', ''))
          IN ('dorm', 'dormitory', 'dormitories', 'dm') THEN 3
        WHEN LOWER(TRIM(rc.category_name)) = 'hall' THEN 4
        ELSE 5
      END,
      NULLIF(regexp_replace(r.room_number, '[^0-9]', '', 'g'), '')::INTEGER
        NULLS LAST,
      r.room_number
    `,
    [period.report_date, periodEnd]
  );

  const activityResult = await db.query<ActivityReportRow>(
    `
    WITH report_period AS (
      SELECT
        $1::TIMESTAMPTZ AS period_start,
        $2::TIMESTAMPTZ AS period_end
    )
    SELECT
      events.event_type,
      events.event_time,
      events.booking_reference,
      events.guest_name,
      events.room_number,
      events.bed_number,
      events.handled_by,
      events.remarks
    FROM (
      SELECT
        'CHECK_IN'::TEXT AS event_type,
        ci.check_in_time AS event_time,
        b.booking_reference,
        g.guest_name,
        r.room_number,
        bd.bed_number,
        u.full_name AS handled_by,
        ci.remarks
      FROM check_ins ci
      INNER JOIN bookings b ON b.id = ci.booking_id
      INNER JOIN guests g ON g.id = ci.guest_id
      INNER JOIN allotments a ON a.id = ci.allotment_id
      INNER JOIN rooms r ON r.id = a.room_id
      LEFT JOIN beds bd ON bd.id = a.bed_id
      LEFT JOIN users u ON u.id = ci.checked_in_by
      CROSS JOIN report_period rp
      WHERE ci.check_in_time >= rp.period_start
        AND ci.check_in_time < rp.period_end

      UNION ALL

      SELECT
        'CHECK_OUT'::TEXT AS event_type,
        co.check_out_time AS event_time,
        b.booking_reference,
        g.guest_name,
        r.room_number,
        bd.bed_number,
        u.full_name AS handled_by,
        co.remarks
      FROM check_outs co
      INNER JOIN bookings b ON b.id = co.booking_id
      INNER JOIN guests g ON g.id = co.guest_id
      INNER JOIN allotments a ON a.id = co.allotment_id
      INNER JOIN rooms r ON r.id = a.room_id
      LEFT JOIN beds bd ON bd.id = a.bed_id
      LEFT JOIN users u ON u.id = co.checked_out_by
      CROSS JOIN report_period rp
      WHERE co.check_out_time >= rp.period_start
        AND co.check_out_time < rp.period_end
    ) events
    ORDER BY events.event_time, events.booking_reference, events.guest_name
    `,
    [periodStart, periodEnd]
  );

  const feedbackResult = await db.query<FeedbackReportRow>(
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
    WHERE f.submitted_at >= $1::TIMESTAMPTZ
      AND f.submitted_at < $2::TIMESTAMPTZ
    ORDER BY f.submitted_at DESC
    `,
    [periodStart, periodEnd]
  );

  const paymentResult = await db.query<{
    payment_method: string;
    total: number | string;
  } & QueryResultRow>(
    `
    SELECT
      UPPER(payment_method) AS payment_method,
      COALESCE(SUM(amount), 0)::NUMERIC(12, 2) AS total
    FROM payments
    WHERE
      payment_date >= $1::TIMESTAMPTZ
      AND payment_date < $2::TIMESTAMPTZ
      AND UPPER(payment_status) IN ('SUCCESS', 'COMPLETED', 'PAID', 'RECEIVED')
    GROUP BY UPPER(payment_method)
    `,
    [periodStart, periodEnd]
  );
  const paymentTotals = paymentResult.rows.reduce(
    (totals, row) => {
      const amount = Number(row.total);
      const method = row.payment_method;
      if (method === "CASH") totals.cash += amount;
      if (method === "UPI") totals.upi += amount;
      if (method === "ONLINE") totals.online += amount;
      if (method === "CHEQUE") totals.cheque += amount;
      totals.total += amount;
      return totals;
    },
    { cash: 0, upi: 0, online: 0, cheque: 0, total: 0 }
  );

  const rooms: DailyReportSnapshot["rooms"] = roomsResult.rows.map((row) => ({
    roomId: String(row.room_id),
    roomNumber: String(row.room_number),
    category: String(row.category_name),
    male: Number(row.male),
    female: Number(row.female),
    children: Number(row.children),
    otherGuests: Number(row.other_guests),
    guests: Number(row.guests),
    amount: Number(row.amount),
  }));
  const totals = rooms.reduce(
    (sum, room) => ({
      male: sum.male + room.male,
      female: sum.female + room.female,
      children: sum.children + room.children,
      otherGuests: sum.otherGuests + room.otherGuests,
      guests: sum.guests + room.guests,
      amount: sum.amount + room.amount,
    }),
    emptyTotals()
  );

  return {
    reportType,
    reportDate: period.report_date,
    periodStart,
    periodEnd,
    generatedAt: new Date().toISOString(),
    rooms,
    totals,
    summaries: {
      acVacantRooms: rooms.filter(
        (room) =>
          ["AC", "VIP", "ACVIP"].includes(normalizeCategory(room.category)) &&
          room.guests === 0
      ).length,
      nonAcVacantRooms: rooms.filter(
        (room) =>
          ["NAC", "NONAC", "NONAIRCONDITIONED"].includes(
            normalizeCategory(room.category)
          ) && room.guests === 0
      ).length,
      acOccupancy: summarizeRooms(rooms, (category) =>
        ["AC", "VIP", "ACVIP"].includes(category)
      ),
      dormitoryOccupancy: summarizeRooms(rooms, (category) =>
        ["DM", "DORM", "DORMITORY", "DORMITORIES"].includes(category)
      ),
    },
    activity: activityResult.rows.map((row) => ({
      eventType: row.event_type,
      eventTime: toIsoString(row.event_time),
      bookingReference: String(row.booking_reference),
      guestName: String(row.guest_name),
      roomNumber: String(row.room_number),
      bedNumber: row.bed_number === null ? null : Number(row.bed_number),
      handledBy: row.handled_by === null ? null : String(row.handled_by),
      remarks: row.remarks === null ? null : String(row.remarks),
    })),
    feedback: feedbackResult.rows.map((row) => ({
      ...row,
      booking_id: String(row.booking_id),
      submitted_at: toIsoString(row.submitted_at),
    })),
    payments: paymentTotals,
  };
};

export const persistDailyReportSnapshot = async (
  reportDate: string,
  reportType: DailyReportType = "DAILY"
): Promise<DailyReportSnapshot> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const snapshot = await buildDailyReportSnapshot(
      reportDate,
      reportType,
      false,
      client
    );
    const result = await client.query<{ snapshot: DailyReportSnapshot }>(
      `
      INSERT INTO daily_report_snapshots (
        report_type,
        report_date,
        period_start,
        period_end,
        snapshot
      )
      VALUES ($1::TEXT, $2::DATE, $3::TIMESTAMPTZ, $4::TIMESTAMPTZ, $5::JSONB)
      ON CONFLICT (report_type, report_date) DO NOTHING
      RETURNING snapshot
      `,
      [
        reportType,
        reportDate,
        snapshot.periodStart,
        snapshot.periodEnd,
        JSON.stringify(snapshot),
      ]
    );
    const savedSnapshot =
      result.rows[0]?.snapshot ??
      (
        await client.query<{ snapshot: DailyReportSnapshot }>(
          "SELECT snapshot FROM daily_report_snapshots WHERE report_type = $1 AND report_date = $2::DATE",
          [reportType, reportDate]
        )
      ).rows[0]?.snapshot;
    if (!savedSnapshot) {
      throw new Error(
        `Daily report snapshot for ${reportDate} could not be saved or retrieved.`
      );
    }
    await client.query("COMMIT");
    return savedSnapshot;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const buildLiveDailyReportSnapshot = async (
  reportDate: string,
  reportType: DailyReportType = "DAILY"
): Promise<DailyReportSnapshot> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await buildDailyReportSnapshot(
      reportDate,
      reportType,
      true,
      client
    );
    await client.query("COMMIT");
    return snapshot;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const dateAfter = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
};

const firstSundayOnOrAfter = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const offset = (7 - parsed.getUTCDay()) % 7;
  parsed.setUTCDate(parsed.getUTCDate() + offset);
  return parsed.toISOString().slice(0, 10);
};

const monthEnd = (date: string): string => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

const nextWeekEnd = (date: string): string => {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 7))
    .toISOString()
    .slice(0, 10);
};

const nextMonthEnd = (date: string): string => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month + 1, 0))
    .toISOString()
    .slice(0, 10);
};

const runDueDailyReports = async (): Promise<void> => {
  const scheduleResult = await pool.query<{
    activation_date: string;
    due_daily_through: string;
    due_weekly_through: string;
    due_monthly_through: string;
  }>(`
    WITH clock AS (
      SELECT
        (CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}')::DATE AS today,
        (CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}')::TIME AS local_time,
        (SELECT activated_at FROM daily_report_scheduler_state WHERE id = 1)
          AT TIME ZONE '${businessTimeZone}' AS activated_at
    ),
    due_dates AS (
      SELECT
        today,
        CASE WHEN local_time >= TIME '21:00' THEN today ELSE today - 1 END
          AS daily_through,
        CASE WHEN local_time >= TIME '21:00' THEN today ELSE today - 1 END
          AS completed_through,
        activated_at::DATE AS activation_date
      FROM clock
    )
    SELECT
      activation_date::TEXT AS activation_date,
      daily_through::TEXT AS due_daily_through,
      (
        date_trunc('week', completed_through + 1)::DATE - 1
      )::TEXT AS due_weekly_through,
      (
        CASE
          WHEN completed_through >=
            (date_trunc('month', completed_through) + INTERVAL '1 month - 1 day')::DATE
          THEN
            (date_trunc('month', completed_through) + INTERVAL '1 month - 1 day')::DATE
          ELSE date_trunc('month', completed_through)::DATE - 1
        END
      )::TEXT AS due_monthly_through
    FROM due_dates
  `);
  const schedule = scheduleResult.rows[0];
  const latestResult = await pool.query<{
    report_type: DailyReportType;
    latest_report_date: string;
  }>(`
    SELECT report_type, MAX(report_date)::TEXT AS latest_report_date
    FROM daily_report_snapshots
    GROUP BY report_type
  `);
  const latestDates = new Map(
    latestResult.rows.map((row) => [row.report_type, row.latest_report_date])
  );

  let nextDate = latestDates.has("DAILY")
    ? dateAfter(latestDates.get("DAILY")!)
    : schedule.activation_date;

  while (nextDate <= schedule.due_daily_through) {
    await persistDailyReportSnapshot(nextDate);
    console.info(`Saved DAILY report snapshot for ${nextDate}.`);
    nextDate = dateAfter(nextDate);
  }

  let nextSunday = latestDates.has("WEEKLY")
    ? nextWeekEnd(latestDates.get("WEEKLY")!)
    : firstSundayOnOrAfter(schedule.activation_date);
  while (nextSunday <= schedule.due_weekly_through) {
    await persistDailyReportSnapshot(nextSunday, "WEEKLY");
    console.info(`Saved WEEKLY report snapshot for ${nextSunday}.`);
    nextSunday = nextWeekEnd(nextSunday);
  }

  let nextMonth = latestDates.has("MONTHLY")
    ? nextMonthEnd(latestDates.get("MONTHLY")!)
    : monthEnd(schedule.activation_date);
  while (nextMonth <= schedule.due_monthly_through) {
    await persistDailyReportSnapshot(nextMonth, "MONTHLY");
    console.info(`Saved MONTHLY report snapshot for ${nextMonth}.`);
    nextMonth = nextMonthEnd(nextMonth);
  }
};

export const startDailyReportScheduler = (): void => {
  const scheduleNextReport = async (): Promise<void> => {
    try {
      const result = await pool.query<{ next_report_time: Date | string }>(`
        WITH business_clock AS (
          SELECT
            CURRENT_TIMESTAMP AS current_time,
            CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}' AS local_time
        )
        SELECT
          (
            (
              local_time::DATE
              + CASE
                  WHEN local_time::TIME < TIME '21:00' THEN 0
                  ELSE 1
                END
              + TIME '21:00'
            ) AT TIME ZONE '${businessTimeZone}'
          ) AS next_report_time
        FROM business_clock
      `);
      const delay = Math.max(
        0,
        new Date(result.rows[0].next_report_time).getTime() - Date.now()
      );
      setTimeout(() => {
        void runAndScheduleNext();
      }, delay);
    } catch (error) {
      console.error("Unable to schedule the next daily report:", error);
      setTimeout(() => {
        void runAndScheduleNext();
      }, 30_000);
    }
  };

  const runAndScheduleNext = async (): Promise<void> => {
    try {
      await runDueDailyReports();
    } catch (error) {
      console.error("Daily report scheduler failed:", error);
      setTimeout(() => {
        void runAndScheduleNext();
      }, 30_000);
      return;
    }
    await scheduleNextReport();
  };

  void runAndScheduleNext();
};
