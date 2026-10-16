import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { pool } from "../config/db.js";
import {
  getUpcomingAdvanceBookings,
  persistDailyReportSnapshot,
  type DailyReportSnapshot,
  type DailyReportType,
  type UpcomingAdvanceBooking,
} from "./dailyReport.js";

const execFile = promisify(execFileCallback);
const businessTimeZone = "Asia/Kolkata";
const reportRoot = "C:\\ESM_REST_HOUSE\\ESM_REPORT";

const reportDirectories: Record<DailyReportType | "ANNUAL", string> = {
  DAILY: path.join(reportRoot, "Daily Report"),
  WEEKLY: path.join(reportRoot, "Weekly Report"),
  MONTHLY: path.join(reportRoot, "Monthly Report"),
  ANNUAL: path.join(reportRoot, "Annually Report"),
};

interface AnnualMonth {
  monthStart: string;
  cashTotal: number;
  upiTotal: number;
  totalCollection: number;
  checkIns: { male: number; female: number; children: number; otherGuests: number; total: number };
  checkOuts: { male: number; female: number; children: number; otherGuests: number; total: number };
}

interface AnnualReport {
  financialYearStart: number;
  monthly: AnnualMonth[];
  totals: {
    cash: number;
    upi: number;
    totalCollection: number;
    checkIns: { male: number; female: number; children: number; otherGuests: number; total: number };
    checkOuts: { male: number; female: number; children: number; otherGuests: number; total: number };
  };
}

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const money = (value: number): string =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const dateLabel = (value: string): string =>
  new Date(`${value.slice(0, 10)}T12:00:00+05:30`).toLocaleDateString(
    "en-IN",
    { timeZone: businessTimeZone, day: "2-digit", month: "short", year: "numeric" }
  );

const dateTimeLabel = (value: string): string =>
  new Date(value).toLocaleString("en-IN", {
    timeZone: businessTimeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const table = (headers: string[], rows: string[][]): string => `
  <table>
    <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
    <tbody>${rows.length
      ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}" class="empty">No records</td></tr>`}
    </tbody>
  </table>`;

const upcomingTable = (bookings: UpcomingAdvanceBooking[]): string =>
  table(
    ["Booking No.", "Booking / Guests", "Status", "Stay", "Room / Bed", "Booking Amount", "Amount Paid"],
    bookings.map((booking) => [
      escapeHtml(booking.bookingReference),
      `<strong>${escapeHtml(booking.serviceMember)}</strong><br>${escapeHtml(booking.guests)} (${booking.guestCount})`,
      `${escapeHtml(booking.bookingStatus)} / ${escapeHtml(booking.approvalStatus)}`,
      `${escapeHtml(dateLabel(booking.checkInDate))} – ${escapeHtml(dateLabel(booking.checkOutDate))}`,
      escapeHtml(booking.roomDetails),
      money(booking.bookingAmount),
      money(booking.amountPaid),
    ])
  );

const htmlDocument = (title: string, body: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { color: #172b4d; font: 10px Arial, sans-serif; margin: 0; }
h1 { font-size: 17px; margin: 0 0 5px; text-align: center; }
h2 { background: #eaf0f5; border: 1px solid #667085; break-after: avoid; font-size: 11px; margin: 15px 0 0; padding: 6px; text-align: center; }
p { margin: 4px 0; }
.header { border-bottom: 1px solid #8090a2; margin-bottom: 10px; padding-bottom: 8px; text-align: center; }
.meta { color: #4b5d72; }
table { border-collapse: collapse; font-size: 9px; margin: 0; table-layout: fixed; width: 100%; }
th, td { border: 1px solid #788698; overflow-wrap: anywhere; padding: 4px 5px; text-align: center; vertical-align: top; }
thead { display: table-header-group; }
thead th { background: #f1f5f9; font-weight: 700; }
tbody tr { break-inside: avoid; }
td:first-child { text-align: left; }
.empty { color: #667085; text-align: center !important; }
.summary { border: 1px solid #788698; display: flex; justify-content: space-around; margin-top: 8px; padding: 7px; }
.summary span { font-weight: 700; }
.note { color: #667085; font-size: 8px; margin-top: 16px; text-align: right; }
</style></head><body>${body}</body></html>`;

const dailyHtml = (
  snapshot: DailyReportSnapshot,
  upcomingBookings: UpcomingAdvanceBooking[]
): string => {
  const typeLabel = snapshot.reportType[0] + snapshot.reportType.slice(1).toLowerCase();
  const roomRows = snapshot.rooms.map((room) => [
    escapeHtml(room.roomNumber),
    escapeHtml(room.category),
    String(room.male),
    String(room.female),
    String(room.children),
    String(room.otherGuests ?? 0),
    String(room.guests),
    money(room.amount),
  ]);
  const activityRows = snapshot.activity.map((event) => [
    escapeHtml(dateTimeLabel(event.eventTime)),
    event.eventType === "CHECK_IN" ? "Check-in" : "Check-out",
    escapeHtml(event.bookingReference),
    escapeHtml(event.guestName),
    `${escapeHtml(event.roomNumber)}${event.bedNumber === null ? "" : ` / Bed ${event.bedNumber}`}`,
    escapeHtml(event.handledBy || "—"),
    escapeHtml(event.remarks || "—"),
  ]);
  const feedbackRows = snapshot.feedback.map((item) => [
    escapeHtml(item.booking_reference),
    escapeHtml(item.service_name || "—"),
    String(item.staff_rating ?? "—"),
    String(item.housekeeping_rating ?? "—"),
    String(item.facilities_rating ?? "—"),
    String(item.food_rating ?? "—"),
    String(item.overall_rating ?? "—"),
    escapeHtml(item.feedback_status === "SKIPPED" ? "Skipped" : item.comments || "—"),
  ]);
  const sections = [
    `<header class="header"><h1>${escapeHtml(typeLabel.toUpperCase())} REPORT · ESM REST HOUSE</h1><p>AS ON: ${escapeHtml(dateLabel(snapshot.reportDate))}</p><p class="meta">REPORTING PERIOD: ${escapeHtml(dateTimeLabel(snapshot.periodStart))} – ${escapeHtml(dateTimeLabel(snapshot.periodEnd))}</p></header>`,
    `<h2>ROOM-WISE OCCUPANCY</h2>${table(["Room", "Category", "Male", "Female", "Child", "Guest (Other)", "Total Guests", "Amount"], roomRows)}<div class="summary"><span>Total guests: ${snapshot.totals.guests}</span><span>Male: ${snapshot.totals.male}</span><span>Female: ${snapshot.totals.female}</span><span>Children: ${snapshot.totals.children}</span><span>Other guests: ${snapshot.totals.otherGuests ?? 0}</span><span>Amount: ${money(snapshot.totals.amount)}</span></div>`,
    `<h2>CHECK-IN / CHECK-OUT ACTIVITY</h2>${table(["Time", "Action", "Booking", "Guest", "Room / Bed", "Handled by", "Remarks"], activityRows)}`,
    `<h2>UPCOMING / ADVANCE BOOKINGS</h2>${upcomingTable(upcomingBookings)}`,
  ];
  if (snapshot.reportType === "MONTHLY") {
    sections.push(`<h2>MONTHLY COLLECTION SUMMARY</h2>${table(["Cash", "UPI", "Online", "Cheque", "Total"], [[money(snapshot.payments.cash), money(snapshot.payments.upi), money(snapshot.payments.online), money(snapshot.payments.cheque), money(snapshot.payments.total)]])}`);
  }
  if (snapshot.feedback.length > 0) {
    sections.push(`<h2>CHECK-OUT GUEST FEEDBACK</h2>${table(["Booking", "Booking Person", "Staff", "Housekeeping", "Facilities", "Food", "Overall", "Comments / Status"], feedbackRows)}`);
  }
  sections.push(`<p class="note">Generated automatically at 9:00 PM · ESM Rest House</p>`);
  return htmlDocument(`${typeLabel} Report ${snapshot.reportDate}`, sections.join("\n"));
};

const buildAnnualReport = async (financialYearStart: number): Promise<AnnualReport> => {
  const periodStart = `${financialYearStart}-04-01`;
  const periodEnd = `${financialYearStart + 1}-04-01`;
  const result = await pool.query<{
    month_start: string;
    cash_total: string | number;
    upi_total: string | number;
    total_collection: string | number;
    checkin_male: string | number;
    checkin_female: string | number;
    checkin_children: string | number;
    checkin_other_guests: string | number;
    checkin_total: string | number;
    checkout_male: string | number;
    checkout_female: string | number;
    checkout_children: string | number;
    checkout_other_guests: string | number;
    checkout_total: string | number;
  }>(
    `
    WITH months AS (
      SELECT generate_series($1::DATE, ($2::DATE - INTERVAL '1 month')::DATE, INTERVAL '1 month')::DATE AS month_start
    ), payment_months AS (
      SELECT
        DATE_TRUNC('month', p.payment_date)::DATE AS month_start,
        COALESCE(SUM(p.amount) FILTER (WHERE UPPER(p.payment_method)='CASH'),0)::NUMERIC(12,2) AS cash_total,
        COALESCE(SUM(p.amount) FILTER (WHERE UPPER(p.payment_method)='UPI'),0)::NUMERIC(12,2) AS upi_total
      FROM payments p
      WHERE p.payment_date >= $1::DATE AND p.payment_date < $2::DATE
        AND UPPER(p.payment_status) IN ('SUCCESS','COMPLETED','PAID','RECEIVED')
        AND UPPER(p.payment_method) IN ('CASH','UPI')
      GROUP BY DATE_TRUNC('month',p.payment_date)::DATE
    ), events AS (
      SELECT 'CHECK_IN'::TEXT AS event_type, ci.check_in_time AS event_time, g.gender, g.guest_category, g.date_of_birth
      FROM check_ins ci INNER JOIN guests g ON g.id=ci.guest_id
      WHERE ci.check_in_time >= $1::DATE AND ci.check_in_time < $2::DATE
      UNION ALL
      SELECT 'CHECK_OUT'::TEXT, co.check_out_time, g.gender, g.guest_category, g.date_of_birth
      FROM check_outs co INNER JOIN guests g ON g.id=co.guest_id
      WHERE co.check_out_time >= $1::DATE AND co.check_out_time < $2::DATE
    ), movements AS (
      SELECT DATE_TRUNC('month',event_time)::DATE AS month_start,event_type,
        COUNT(*) FILTER (WHERE guest_category='CHILD' OR (COALESCE(guest_category,'') NOT IN ('CHILD','GUEST') AND date_of_birth IS NOT NULL AND date_of_birth > event_time::DATE-INTERVAL '12 years' AND date_of_birth<=event_time::DATE))::INTEGER AS children,
        COUNT(*) FILTER (WHERE (guest_category='MALE' OR guest_category IS NULL) AND (date_of_birth IS NULL OR date_of_birth<=event_time::DATE-INTERVAL '12 years') AND UPPER(COALESCE(gender,''))='MALE')::INTEGER AS male,
        COUNT(*) FILTER (WHERE (guest_category='FEMALE' OR guest_category IS NULL) AND (date_of_birth IS NULL OR date_of_birth<=event_time::DATE-INTERVAL '12 years') AND UPPER(COALESCE(gender,''))='FEMALE')::INTEGER AS female,
        COUNT(*) FILTER (WHERE guest_category='GUEST')::INTEGER AS other_guests,
        COUNT(*)::INTEGER AS guests
      FROM events GROUP BY DATE_TRUNC('month',event_time)::DATE,event_type
    )
    SELECT TO_CHAR(m.month_start,'YYYY-MM-DD') AS month_start,
      COALESCE(p.cash_total,0)::NUMERIC(12,2) AS cash_total,
      COALESCE(p.upi_total,0)::NUMERIC(12,2) AS upi_total,
      (COALESCE(p.cash_total,0)+COALESCE(p.upi_total,0))::NUMERIC(12,2) AS total_collection,
      COALESCE(ci.male,0)::INTEGER AS checkin_male,
      COALESCE(ci.female,0)::INTEGER AS checkin_female,
      COALESCE(ci.children,0)::INTEGER AS checkin_children,
      COALESCE(ci.other_guests,0)::INTEGER AS checkin_other_guests,
      COALESCE(ci.guests,0)::INTEGER AS checkin_total,
      COALESCE(co.male,0)::INTEGER AS checkout_male,
      COALESCE(co.female,0)::INTEGER AS checkout_female,
      COALESCE(co.children,0)::INTEGER AS checkout_children,
      COALESCE(co.other_guests,0)::INTEGER AS checkout_other_guests,
      COALESCE(co.guests,0)::INTEGER AS checkout_total
    FROM months m
    LEFT JOIN payment_months p ON p.month_start=m.month_start
    LEFT JOIN movements ci ON ci.month_start=m.month_start AND ci.event_type='CHECK_IN'
    LEFT JOIN movements co ON co.month_start=m.month_start AND co.event_type='CHECK_OUT'
    ORDER BY m.month_start
    `,
    [periodStart, periodEnd]
  );
  const monthly: AnnualMonth[] = result.rows.map((row) => ({
    monthStart: row.month_start,
    cashTotal: Number(row.cash_total),
    upiTotal: Number(row.upi_total),
    totalCollection: Number(row.total_collection),
    checkIns: { male: Number(row.checkin_male), female: Number(row.checkin_female), children: Number(row.checkin_children), otherGuests: Number(row.checkin_other_guests), total: Number(row.checkin_total) },
    checkOuts: { male: Number(row.checkout_male), female: Number(row.checkout_female), children: Number(row.checkout_children), otherGuests: Number(row.checkout_other_guests), total: Number(row.checkout_total) },
  }));
  const sumCounts = (key: "checkIns" | "checkOuts") => monthly.reduce(
    (totals, month) => ({
      male: totals.male + month[key].male,
      female: totals.female + month[key].female,
      children: totals.children + month[key].children,
      otherGuests: totals.otherGuests + month[key].otherGuests,
      total: totals.total + month[key].total,
    }),
    { male: 0, female: 0, children: 0, otherGuests: 0, total: 0 }
  );
  return {
    financialYearStart,
    monthly,
    totals: {
      cash: monthly.reduce((sum, month) => sum + month.cashTotal, 0),
      upi: monthly.reduce((sum, month) => sum + month.upiTotal, 0),
      totalCollection: monthly.reduce((sum, month) => sum + month.totalCollection, 0),
      checkIns: sumCounts("checkIns"),
      checkOuts: sumCounts("checkOuts"),
    },
  };
};

const annualHtml = (
  report: AnnualReport,
  upcomingBookings: UpcomingAdvanceBooking[]
): string => {
  const monthlyRows = report.monthly.map((month) => [
    escapeHtml(new Date(`${month.monthStart}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: businessTimeZone, month: "long", year: "numeric" })),
    money(month.cashTotal),
    money(month.upiTotal),
    money(month.totalCollection),
    `${month.checkIns.male} / ${month.checkIns.female} / ${month.checkIns.children} / ${month.checkIns.otherGuests} / ${month.checkIns.total}`,
    `${month.checkOuts.male} / ${month.checkOuts.female} / ${month.checkOuts.children} / ${month.checkOuts.otherGuests} / ${month.checkOuts.total}`,
  ]);
  monthlyRows.push([
    "FINANCIAL YEAR TOTAL",
    money(report.totals.cash),
    money(report.totals.upi),
    money(report.totals.totalCollection),
    `${report.totals.checkIns.male} / ${report.totals.checkIns.female} / ${report.totals.checkIns.children} / ${report.totals.checkIns.otherGuests} / ${report.totals.checkIns.total}`,
    `${report.totals.checkOuts.male} / ${report.totals.checkOuts.female} / ${report.totals.checkOuts.children} / ${report.totals.checkOuts.otherGuests} / ${report.totals.checkOuts.total}`,
  ]);
  return htmlDocument(
    `Annual Report ${report.financialYearStart}-${report.financialYearStart + 1}`,
    `<header class="header"><h1>ANNUAL REPORT · ESM REST HOUSE</h1><p>FINANCIAL YEAR: ${report.financialYearStart}–${report.financialYearStart + 1}</p><p class="meta">01 Apr ${report.financialYearStart} – 31 Mar ${report.financialYearStart + 1}</p></header><h2>MONTHLY COLLECTION AND GUEST MOVEMENT</h2>${table(["Month", "Cash", "UPI", "Total Collection", "Check-ins M/F/Child/Guest/Total", "Check-outs M/F/Child/Guest/Total"], monthlyRows)}<h2>UPCOMING / ADVANCE BOOKINGS</h2>${upcomingTable(upcomingBookings)}<p class="note">Generated automatically at 9:00 PM · ESM Rest House</p>`
  );
};

const getEdgeExecutable = (): string => {
  const candidates = [
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"]!, "Microsoft", "Edge", "Application", "msedge.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const edge = candidates.find(existsSync);
  if (!edge) {
    throw new Error("Microsoft Edge is required to generate scheduled report PDFs.");
  }
  return edge;
};

const savePdf = async (outputPath: string, html: string): Promise<void> => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  try {
    const existing = await stat(outputPath);
    if (existing.size > 1024) return;
    await unlink(outputPath);
  } catch {
    // The report has not been exported yet.
  }

  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "esm-report-"));
  const htmlPath = path.join(tempDirectory, "report.html");
  const profilePath = path.join(tempDirectory, "edge-profile");
  try {
    await writeFile(htmlPath, html, "utf8");
    await execFile(getEdgeExecutable(), [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--user-data-dir=${profilePath}`,
      `--print-to-pdf=${outputPath}`,
      pathToFileURL(htmlPath).href,
    ], { windowsHide: true, timeout: 120_000 });
    const generated = await stat(outputPath);
    if (generated.size < 1024) {
      throw new Error(`Generated PDF is unexpectedly small: ${outputPath}`);
    }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};

const outputFile = (type: DailyReportType, date: string): string => {
  if (type === "MONTHLY") {
    return path.join(reportDirectories.MONTHLY, `Monthly Report - ${date.slice(0, 7)}.pdf`);
  }
  if (type === "WEEKLY") {
    return path.join(reportDirectories.WEEKLY, `Weekly Report - ${date}.pdf`);
  }
  return path.join(reportDirectories.DAILY, `Daily Report - ${date}.pdf`);
};

const ensureDailySnapshotExported = async (
  reportDate: string,
  type: DailyReportType
): Promise<void> => {
  const destination = outputFile(type, reportDate);
  try {
    if ((await stat(destination)).size > 1024) return;
  } catch {
    // Export missing report below.
  }
  const snapshot = await persistDailyReportSnapshot(reportDate, type);
  const upcomingBookings = await getUpcomingAdvanceBookings();
  await savePdf(destination, dailyHtml(snapshot, upcomingBookings));
  console.info(`Saved ${type} report PDF: ${destination}`);
};

const firstSundayOnOrAfter = (date: string): string => {
  const value = new Date(`${date}T12:00:00Z`);
  const daysUntilSunday = (7 - value.getUTCDay()) % 7;
  value.setUTCDate(value.getUTCDate() + daysUntilSunday);
  return value.toISOString().slice(0, 10);
};

const dateAfter = (date: string, days = 1): string => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

const monthEnd = (date: string): string => {
  const [year, month] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};

export const exportDueReportPdfs = async (): Promise<void> => {
  const schedule = await pool.query<{
    activation_date: string;
    completed_through: string;
  }>(`
    SELECT
      (activated_at AT TIME ZONE '${businessTimeZone}')::DATE::TEXT AS activation_date,
      CASE
        WHEN (CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}')::TIME >= TIME '21:00'
          THEN (CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}')::DATE::TEXT
        ELSE ((CURRENT_TIMESTAMP AT TIME ZONE '${businessTimeZone}')::DATE - 1)::TEXT
      END AS completed_through
    FROM daily_report_scheduler_state
    WHERE id = 1
  `);
  const { activation_date: activationDate, completed_through: completedThrough } = schedule.rows[0];
  if (completedThrough < activationDate) return;

  let dailyDate = activationDate;
  while (dailyDate <= completedThrough) {
    await ensureDailySnapshotExported(dailyDate, "DAILY");
    dailyDate = dateAfter(dailyDate);
  }

  let weeklyDate = firstSundayOnOrAfter(activationDate);
  while (weeklyDate <= completedThrough) {
    await ensureDailySnapshotExported(weeklyDate, "WEEKLY");
    weeklyDate = dateAfter(weeklyDate, 7);
  }

  let monthlyDate = monthEnd(activationDate);
  while (monthlyDate <= completedThrough) {
    await ensureDailySnapshotExported(monthlyDate, "MONTHLY");
    const [year, month] = monthlyDate.split("-").map(Number);
    monthlyDate = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  }

  const completedDate = new Date(`${completedThrough}T12:00:00Z`);
  const currentYear = completedDate.getUTCFullYear();
  const latestCompletedAnnualStart = completedThrough >= `${currentYear}-03-31`
    ? currentYear - 1
    : currentYear - 2;
  let annualStart = latestCompletedAnnualStart;
  while (annualStart < 2000) annualStart += 1;
  const annualDestination = path.join(
    reportDirectories.ANNUAL,
    `Annual Report - FY ${annualStart}-${annualStart + 1}.pdf`
  );
  try {
    if ((await stat(annualDestination)).size > 1024) return;
  } catch {
    // Export the latest completed financial year below.
  }
  const annual = await buildAnnualReport(annualStart);
  const upcomingBookings = await getUpcomingAdvanceBookings();
  await savePdf(annualDestination, annualHtml(annual, upcomingBookings));
  console.info(`Saved ANNUAL report PDF: ${annualDestination}`);
};
