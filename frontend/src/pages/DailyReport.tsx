import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api";
import AppModal from "../components/AppModal";
import { useLanguage } from "../i18n/LanguageContext";
import type { User } from "../App";

interface DailyReportRoom {
  roomId: string;
  roomNumber: string;
  category: string;
  male: number;
  female: number;
  children: number;
  otherGuests: number;
  guests: number;
  amount: number;
}

interface UpcomingAdvanceBooking {
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

interface OccupancyTotals {
  male: number;
  female: number;
  children: number;
  otherGuests: number;
  guests: number;
  amount: number;
}

interface DailyReportData {
  success: boolean;
  reportType: "DAILY" | "WEEKLY" | "MONTHLY";
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  snapshotSaved: boolean;
  upcomingAdvanceBookings?: UpcomingAdvanceBooking[];
  rooms: DailyReportRoom[];
  totals: OccupancyTotals;
  activity: {
    eventType: "CHECK_IN" | "CHECK_OUT";
    eventTime: string;
    bookingReference: string;
    guestName: string;
    roomNumber: string;
    bedNumber: number | null;
    handledBy: string | null;
    remarks: string | null;
  }[];
  feedback: CheckoutFeedbackReportRow[];
  payments: {
    cash: number;
    upi: number;
    online: number;
    cheque: number;
    total: number;
  };
  summaries: {
    acVacantRooms: number;
    nonAcVacantRooms: number;
    acOccupancy: OccupancyTotals;
    dormitoryOccupancy: OccupancyTotals;
  };
  message?: string;
}

type ReportType = DailyReportData["reportType"] | "ANNUAL";

interface AnnualGuestCounts {
  male: number;
  female: number;
  children: number;
  otherGuests: number;
  total: number;
}

interface AnnualReportMonth {
  monthStart: string;
  cashTotal: number;
  upiTotal: number;
  totalCollection: number;
  checkIns: AnnualGuestCounts;
  checkOuts: AnnualGuestCounts;
}

interface AnnualReportData {
  success: boolean;
  financialYearStart: number;
  periodStart: string;
  periodEnd: string;
  upcomingAdvanceBookings: UpcomingAdvanceBooking[];
  monthly: AnnualReportMonth[];
  totals: {
    cash: number;
    upi: number;
    totalCollection: number;
    checkIns: AnnualGuestCounts;
    checkOuts: AnnualGuestCounts;
  };
}

interface CheckoutFeedbackReportRow {
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
}

interface MonthlyPaymentTransaction {
  paymentDate: string;
  paymentTime: string;
  bookingReference: string;
  guestName: string;
  amount: number;
}

interface MonthlyPaymentPrintData {
  method: "CASH" | "UPI";
  transactions: MonthlyPaymentTransaction[];
  total: number;
  monthLabel: string;
  monthDate: string;
}

interface DailyReportProps {
  user: User;
  onBack: () => void;
}

const getLocalDateValue = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getCurrentFinancialYearStart = (): number => {
  const today = new Date();
  return today.getMonth() >= 3
    ? today.getFullYear()
    : today.getFullYear() - 1;
};

const normalizeCategory = (value: string): string =>
  value.toUpperCase().replace(/[\s_-]/g, "");

function DailyReport({ user, onBack }: DailyReportProps) {
  const { language } = useLanguage();
  const today = getLocalDateValue();
  const currentFinancialYearStart = getCurrentFinancialYearStart();
  const [reportType, setReportType] = useState<ReportType>("DAILY");
  const [date, setDate] = useState(today);
  const [financialYearStart, setFinancialYearStart] =
    useState(currentFinancialYearStart);
  const [report, setReport] = useState<DailyReportData | null>(null);
  const [annualReport, setAnnualReport] =
    useState<AnnualReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [paymentPrint, setPaymentPrint] =
    useState<MonthlyPaymentPrintData | null>(null);
  const [annualPaymentDetails, setAnnualPaymentDetails] =
    useState<MonthlyPaymentPrintData | null>(null);
  const [annualPaymentLoading, setAnnualPaymentLoading] =
    useState<string | null>(null);
  const [printingPaymentMethod, setPrintingPaymentMethod] =
    useState<"CASH" | "UPI" | null>(null);
  const hasReport = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshCounter((current) => current + 1);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadReport = async () => {
      if (!hasReport.current) {
        setLoading(true);
      }
      setError("");
      try {
        const endpoint = reportType === "ANNUAL"
          ? `http://localhost:5000/api/dashboard/annual-report?start_year=${financialYearStart}`
          : `http://localhost:5000/api/dashboard/daily-report?date=${encodeURIComponent(date)}&period=${reportType.toLowerCase()}`;
        const response = await apiFetch(endpoint, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load the daily report.");
        }
        if (!cancelled) {
          if (reportType === "ANNUAL") {
            setAnnualReport(data as AnnualReportData);
            setReport(null);
          } else {
            setReport(data as DailyReportData);
            setAnnualReport(null);
          }
          hasReport.current = true;
          setLastUpdated(new Date());
        }
      } catch (loadError) {
        if (!cancelled) {
          setReport(null);
          setAnnualReport(null);
          hasReport.current = false;
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the daily report."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [date, financialYearStart, refreshCounter, reportType]);

  useEffect(() => {
    if (!paymentPrint) return;

    const clearPaymentPrint = () => setPaymentPrint(null);
    const printTimer = window.setTimeout(() => {
      void (async () => {
        try {
          if (window.electronAPI) {
            await window.electronAPI.savePrintablePdf(
              "payment-transactions",
              `${paymentPrint.monthDate}-${paymentPrint.method}-Transactions`
            );
          }
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : "Unable to save the payment transactions PDF."
          );
        } finally {
          window.print();
        }
      })();
    }, 250);
    window.addEventListener("afterprint", clearPaymentPrint);

    return () => {
      window.clearTimeout(printTimer);
      window.removeEventListener("afterprint", clearPaymentPrint);
    };
  }, [paymentPrint]);

  const formatDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(
      language === "mr" ? "mr-IN" : "en-IN",
      { day: "2-digit", month: "2-digit", year: "numeric" }
    );

  const formatMonth = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(
      language === "mr" ? "mr-IN" : "en-IN",
      { month: "long", year: "numeric" }
    );

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(
      language === "mr" ? "mr-IN" : "en-IN",
      {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );

  const formatAmount = (amount: number) =>
    amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const printPaymentTransactions = async (
    method: "CASH" | "UPI",
    monthDate = date
  ) => {
    setPrintingPaymentMethod(method);
    setError("");
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/dashboard/monthly-payment-transactions?date=${encodeURIComponent(monthDate)}&method=${method}`,
        { cache: "no-store" }
      );
      const data: {
        success: boolean;
        transactions?: MonthlyPaymentTransaction[];
        total?: number;
        message?: string;
      } = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load payment transactions.");
      }
      setPaymentPrint({
        method,
        transactions: data.transactions ?? [],
        total: Number(data.total ?? 0),
        monthLabel: formatMonth(monthDate),
        monthDate,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load payment transactions."
      );
    } finally {
      setPrintingPaymentMethod(null);
    }
  };

  const openAnnualPaymentDetails = async (
    month: AnnualReportMonth,
    method: "CASH" | "UPI"
  ) => {
    const requestKey = `${month.monthStart}-${method}`;
    setAnnualPaymentLoading(requestKey);
    setError("");
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/dashboard/monthly-payment-transactions?date=${encodeURIComponent(month.monthStart)}&method=${method}`,
        { cache: "no-store" }
      );
      const data: {
        success: boolean;
        transactions?: MonthlyPaymentTransaction[];
        total?: number;
        message?: string;
      } = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load payment transactions.");
      }
      setAnnualPaymentDetails({
        method,
        transactions: data.transactions ?? [],
        total: Number(data.total ?? 0),
        monthLabel: formatMonth(month.monthStart),
        monthDate: month.monthStart,
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load payment transactions."
      );
    } finally {
      setAnnualPaymentLoading(null);
    }
  };

  const groupRooms = (side: "rooms" | "dormitory") => {
    const selected = report?.rooms ?? [];
    return selected.filter((room) => {
      const category = normalizeCategory(room.category);
      if (side === "rooms") {
        return [
          "AC",
          "VIP",
          "ACVIP",
          "NAC",
          "NONAC",
          "NONAIRCONDITIONED",
        ].includes(category);
      }
      return [
        "DM",
        "DORM",
        "DORMITORY",
        "DORMITORIES",
        "HALL",
      ].includes(category);
    });
  };

  const sumRooms = (rooms: DailyReportRoom[]): OccupancyTotals =>
    rooms.reduce(
      (sum, room) => ({
        male: sum.male + room.male,
        female: sum.female + room.female,
        children: sum.children + room.children,
        otherGuests: sum.otherGuests + (room.otherGuests ?? 0),
        guests: sum.guests + room.guests,
        amount: sum.amount + room.amount,
      }),
      { male: 0, female: 0, children: 0, otherGuests: 0, guests: 0, amount: 0 }
    );

  const renderRoomTable = (rooms: DailyReportRoom[], title: string) => {
    const totals = sumRooms(rooms);
    return (
      <section className="daily-report-column">
        <h2>{title}</h2>
        <table>
          <thead>
            <tr>
              <th>{language === "mr" ? "खोली क्र." : "Room No"}</th>
              <th>{language === "mr" ? "पुरुष" : "Male"}</th>
              <th>{language === "mr" ? "महिला" : "Female"}</th>
              <th>{language === "mr" ? "बालक" : "Child"}</th>
              <th>{language === "mr" ? "इतर अतिथी" : "Guest (Other)"}</th>
              <th>{language === "mr" ? "एकूण" : "Total"}</th>
              <th>{language === "mr" ? "रक्कम" : "Amt"}</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <tr key={room.roomId}>
                <th scope="row">{room.roomNumber}</th>
                <td>{room.male}</td>
                <td>{room.female}</td>
                <td>{room.children}</td>
                <td>{room.otherGuests ?? 0}</td>
                <td>{room.guests}</td>
                <td>{formatAmount(room.amount)}</td>
              </tr>
            ))}
            {rooms.length === 0 && (
              <tr>
                <td colSpan={7} className="daily-report-empty">
                  {language === "mr" ? "खोल्या उपलब्ध नाहीत" : "No rooms configured"}
                </td>
              </tr>
            )}
            <tr className="daily-report-total-row">
              <th scope="row">{language === "mr" ? "एकूण" : "Total"}</th>
              <td>{totals.male}</td>
              <td>{totals.female}</td>
              <td>{totals.children}</td>
              <td>{totals.otherGuests}</td>
              <td>{totals.guests}</td>
              <td>{formatAmount(totals.amount)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    );
  };

  const upcomingAdvanceBookings =
    report?.upcomingAdvanceBookings ??
    annualReport?.upcomingAdvanceBookings ??
    [];
  const renderUpcomingAdvanceBookings = () => (
    <section className="daily-report-activity">
      <h2>
        {language === "mr" ? "आगामी / आगाऊ बुकिंग" : "UPCOMING / ADVANCE BOOKINGS"}
      </h2>
      <table>
        <thead>
          <tr>
            <th>{language === "mr" ? "बुकिंग क्र." : "Booking No."}</th>
            <th>{language === "mr" ? "बुकिंग तपशील" : "Booking Details"}</th>
            <th>{language === "mr" ? "स्थिती" : "Status"}</th>
            <th>{language === "mr" ? "मुक्काम" : "Stay"}</th>
            <th>{language === "mr" ? "खोली / बेड" : "Room / Bed"}</th>
            <th>{language === "mr" ? "बुकिंग रक्कम" : "Booking Amount"}</th>
            <th>{language === "mr" ? "भरलेली रक्कम" : "Amount Paid"}</th>
          </tr>
        </thead>
        <tbody>
          {upcomingAdvanceBookings.map((booking) => (
            <tr key={booking.bookingReference}>
              <th scope="row">{booking.bookingReference}</th>
              <td>
                <strong>{booking.serviceMember}</strong>
                <br />
                {booking.guests} · {booking.guestCount} {language === "mr" ? "अतिथी" : "guest(s)"}
              </td>
              <td>{booking.bookingStatus} / {booking.approvalStatus}</td>
              <td>{formatDate(booking.checkInDate)} – {formatDate(booking.checkOutDate)}</td>
              <td>{booking.roomDetails}</td>
              <td>₹{formatAmount(booking.bookingAmount)}</td>
              <td>₹{formatAmount(booking.amountPaid)}</td>
            </tr>
          ))}
          {upcomingAdvanceBookings.length === 0 && (
            <tr>
              <td colSpan={7} className="daily-report-empty">
                {language === "mr" ? "आगामी आगाऊ बुकिंग नाही." : "No upcoming advance bookings."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );

  const leftRooms = groupRooms("rooms");
  const rightRooms = groupRooms("dormitory");
  const feedbackReport = report?.feedback ?? [];
  const reportTypeLabel =
    reportType === "DAILY"
      ? language === "mr" ? "दैनिक" : "DAILY"
      : reportType === "WEEKLY"
        ? language === "mr" ? "साप्ताहिक" : "WEEKLY"
        : reportType === "MONTHLY"
          ? language === "mr" ? "मासिक" : "MONTHLY"
          : language === "mr" ? "वार्षिक" : "ANNUAL";
  const reportTypeMarathi =
    reportType === "DAILY"
      ? "दैनिक"
      : reportType === "WEEKLY"
        ? "साप्ताहिक"
        : reportType === "MONTHLY"
          ? "मासिक"
          : "वार्षिक";

  const printReport = async () => {
    try {
      if (window.electronAPI) {
        const fileName = reportType === "ANNUAL"
          ? `Annual-Report-${financialYearStart}-${financialYearStart + 1}`
          : `${reportType}-Report-${date}`;
        await window.electronAPI.savePrintablePdf("reports", fileName);
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the report PDF."
      );
    } finally {
      window.print();
    }
  };

  return (
    <main
      className={`daily-report-screen${paymentPrint ? " daily-report-payment-print-active" : ""}`}
    >
      <header className="daily-report-toolbar">
        <div>
          <span className="daily-report-eyebrow">
            {language === "mr" ? `${reportTypeMarathi} अहवाल` : `${reportTypeLabel} REPORT`}
          </span>
          <h1>{language === "mr" ? "ESM विश्रामगृह" : "ESM Rest House"}</h1>
          <p>{user.name} · {user.role}</p>
        </div>
        <div className="daily-report-controls">
          <span className="daily-report-live-status">
            <i aria-hidden="true" />
            {reportType === "ANNUAL"
              ? language === "mr"
                ? "आर्थिक वर्षाचा थेट अहवाल"
                : "Live financial-year report"
              : report?.snapshotSaved
              ? reportType === "DAILY"
                ? language === "mr"
                  ? "मागील २४ तासांचा अहवाल · रात्री ९ वाजता जतन"
                  : "Previous 24 hours · saved daily at 9 PM"
                : language === "mr"
                  ? "जतन केलेला अहवाल · रात्री ९ वाजता"
                  : "Saved report · generated at 9 PM"
              : language === "mr"
                ? "थेट पूर्वावलोकन · रात्री ९ वाजता आपोआप जतन"
                : "Live preview · automatically saved at 9 PM"}
            {lastUpdated && (
              <small>
                {language === "mr" ? "शेवटचे अपडेट:" : "Updated:"}{" "}
                {lastUpdated.toLocaleTimeString(
                  language === "mr" ? "mr-IN" : "en-IN",
                  { hour: "2-digit", minute: "2-digit", second: "2-digit" }
                )}
              </small>
            )}
          </span>
          <button
            type="button"
            className="daily-report-secondary"
            onClick={() => setRefreshCounter((current) => current + 1)}
          >
            {language === "mr" ? "आता अपडेट करा" : "Refresh now"}
          </button>
          <label>
            {language === "mr" ? "अहवाल प्रकार" : "Report type"}
            <select
              value={reportType}
              onChange={(event) => {
                hasReport.current = false;
                setReport(null);
                setReportType(event.target.value as DailyReportData["reportType"]);
              }}
            >
              <option value="DAILY">{language === "mr" ? "दैनिक" : "Daily"}</option>
              <option value="WEEKLY">{language === "mr" ? "साप्ताहिक" : "Weekly"}</option>
              <option value="MONTHLY">{language === "mr" ? "मासिक" : "Monthly"}</option>
              <option value="ANNUAL">{language === "mr" ? "वार्षिक" : "Annual"}</option>
            </select>
          </label>
          {reportType === "ANNUAL" ? (
            <label>
              {language === "mr" ? "आर्थिक वर्ष" : "Financial year"}
              <select
                value={financialYearStart}
                onChange={(event) => {
                  hasReport.current = false;
                  setAnnualReport(null);
                  setFinancialYearStart(Number(event.target.value));
                }}
              >
                {Array.from(
                  { length: currentFinancialYearStart - 1999 },
                  (_, index) => currentFinancialYearStart - index
                ).map((year) => (
                  <option key={year} value={year}>
                    FY {year}–{String(year + 1).slice(-2)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              {reportType === "DAILY"
                ? language === "mr" ? "तारीख" : "Report date"
                : reportType === "WEEKLY"
                  ? language === "mr" ? "आठवड्यातील तारीख" : "Date in week"
                  : language === "mr" ? "महिन्यातील तारीख" : "Date in month"}
              <input
                type="date"
                value={date}
                max={today}
                onChange={(event) => {
                  hasReport.current = false;
                  setReport(null);
                  setDate(event.target.value);
                }}
              />
            </label>
          )}
          <button type="button" className="daily-report-secondary" onClick={onBack}>
            {language === "mr" ? "डॅशबोर्ड" : "Dashboard"}
          </button>
          <button
            type="button"
            className="daily-report-primary"
            onClick={() => void printReport()}
            disabled={(!report && !annualReport) || loading}
          >
            {language === "mr" ? "प्रिंट / PDF जतन करा" : "Print / Save as PDF"}
          </button>
        </div>
      </header>

      {error && <p className="daily-report-error" role="alert">{error}</p>}
      {loading && <p className="daily-report-loading">{language === "mr" ? "अहवाल लोड होत आहे..." : "Loading report..."}</p>}

      {report && !loading && (
        <article className="daily-report-printable">
          <header className="daily-report-sheet-header">
            <h1>
              {language === "mr"
                ? `ESM विश्रामगृह ${reportTypeMarathi} अहवाल`
                : `${reportTypeLabel} REPORT OF ESM REST HOUSE`}
            </h1>
            <p>
              {language === "mr" ? "दिनांक :" : "AS ON:"} {formatDate(report.reportDate)}
            </p>
            <p className="daily-report-period">
              {language === "mr" ? "अहवाल कालावधी:" : "REPORTING PERIOD:"}{" "}
              {formatDateTime(report.periodStart)} – {formatDateTime(report.periodEnd)}
              {report.snapshotSaved
                ? language === "mr"
                  ? " · जतन केलेला snapshot"
                  : " · Saved snapshot"
                : language === "mr"
                  ? " · live preview"
                  : " · Live preview"}
            </p>
            <small>
              {language === "mr"
                ? "बालक: निवडलेला Child प्रकार किंवा पूर्वीच्या नोंदीनुसार १२ वर्षांखालील; Guest (Other) स्वतंत्र मोजला जातो."
                : "Children include the selected Child category and legacy guests under 12; Guest (Other) is counted separately."}
            </small>
          </header>

          <div className="daily-report-tables">
            {renderRoomTable(leftRooms, language === "mr" ? "AC / NAC कक्ष" : "AC / NAC ROOMS")}
            {renderRoomTable(rightRooms, language === "mr" ? "वसतिगृह / हॉल" : "B&B / DORMITORY / HALL")}
          </div>

          <section className="daily-report-summary">
            <div>
              <strong>{language === "mr" ? "AC रिक्त खोल्या" : "AC Vacant Rooms"}</strong>
              <span>{report.summaries.acVacantRooms}</span>
            </div>
            <div>
              <strong>{language === "mr" ? "Non-AC रिक्त खोल्या" : "Non-AC Vacant Rooms"}</strong>
              <span>{report.summaries.nonAcVacantRooms}</span>
            </div>
            <div>
              <strong>{language === "mr" ? "AC STR · M / F / CH / G" : "AC STR · M / F / CH / G"}</strong>
              <span>
                {report.summaries.acOccupancy.male} / {report.summaries.acOccupancy.female} /{" "}
                {report.summaries.acOccupancy.children} / {report.summaries.acOccupancy.otherGuests ?? 0}
              </span>
            </div>
            <div>
              <strong>{language === "mr" ? "DM STR · M / F / CH / G" : "DM STR · M / F / CH / G"}</strong>
              <span>
                {report.summaries.dormitoryOccupancy.male} / {report.summaries.dormitoryOccupancy.female} /{" "}
                {report.summaries.dormitoryOccupancy.children} / {report.summaries.dormitoryOccupancy.otherGuests ?? 0}
              </span>
            </div>
            <div>
              <strong>{language === "mr" ? "एकूण अतिथी" : "TOTAL GUESTS"}</strong>
              <span>{report.totals.guests}</span>
            </div>
          </section>
          <section className="daily-report-activity">
            <h2>
              {reportType === "DAILY"
                ? language === "mr"
                  ? "मागील २४ तासांतील चेक-इन / चेक-आउट"
                  : "CHECK-IN / CHECK-OUT — PREVIOUS 24 HOURS"
                : language === "mr"
                  ? `${reportTypeLabel} कालावधीतील चेक-इन / चेक-आउट`
                  : `CHECK-IN / CHECK-OUT — ${reportTypeLabel} PERIOD`}
            </h2>
            <table>
              <thead>
                <tr>
                  <th>{language === "mr" ? "वेळ" : "Time"}</th>
                  <th>{language === "mr" ? "प्रकार" : "Action"}</th>
                  <th>{language === "mr" ? "बुकिंग" : "Booking"}</th>
                  <th>{language === "mr" ? "अतिथी" : "Guest"}</th>
                  <th>{language === "mr" ? "खोली / बेड" : "Room / Bed"}</th>
                  <th>{language === "mr" ? "नोंद करणारे" : "Handled by"}</th>
                  <th>{language === "mr" ? "शेरा" : "Remarks"}</th>
                </tr>
              </thead>
              <tbody>
                {report.activity.map((item, index) => (
                  <tr key={`${item.eventType}-${item.eventTime}-${item.bookingReference}-${index}`}>
                    <td>{formatDateTime(item.eventTime)}</td>
                    <td>
                      {item.eventType === "CHECK_IN"
                        ? language === "mr" ? "चेक-इन" : "Check-in"
                        : language === "mr" ? "चेक-आउट" : "Check-out"}
                    </td>
                    <td>{item.bookingReference}</td>
                    <td>{item.guestName}</td>
                    <td>
                      {item.roomNumber}
                      {item.bedNumber !== null ? ` / ${item.bedNumber}` : ""}
                    </td>
                    <td>{item.handledBy || "—"}</td>
                    <td>{item.remarks || "—"}</td>
                  </tr>
                ))}
                {report.activity.length === 0 && (
                  <tr>
                    <td colSpan={7} className="daily-report-empty">
                      {reportType === "DAILY"
                        ? language === "mr"
                          ? "या २४ तासांत चेक-इन / चेक-आउट नोंद नाही"
                          : "No check-ins or check-outs in this 24-hour period"
                        : language === "mr"
                          ? "या कालावधीत चेक-इन / चेक-आउट नोंद नाही"
                          : "No check-ins or check-outs in this report period"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
          {renderUpcomingAdvanceBookings()}
          {reportType === "MONTHLY" && (
            <section className="daily-report-payment-summary">
              <h2>
                {language === "mr"
                  ? "मासिक जमा रक्कम"
                  : "MONTHLY COLLECTION SUMMARY"}
              </h2>
              <div>
                <strong>{language === "mr" ? "रोख जमा" : "CASH COLLECTED"}</strong>
                <span>₹{formatAmount(report.payments.cash)}</span>
                <button
                  type="button"
                  className="daily-report-transaction-print"
                  onClick={() => void printPaymentTransactions("CASH")}
                  disabled={printingPaymentMethod !== null}
                >
                  {printingPaymentMethod === "CASH"
                    ? language === "mr" ? "व्यवहार लोड होत आहेत..." : "Loading transactions..."
                    : language === "mr" ? "रोख व्यवहार प्रिंट करा" : "Print cash transactions"}
                </button>
              </div>
              <div>
                <strong>{language === "mr" ? "UPI जमा" : "UPI COLLECTED"}</strong>
                <span>₹{formatAmount(report.payments.upi)}</span>
                <button
                  type="button"
                  className="daily-report-transaction-print"
                  onClick={() => void printPaymentTransactions("UPI")}
                  disabled={printingPaymentMethod !== null}
                >
                  {printingPaymentMethod === "UPI"
                    ? language === "mr" ? "व्यवहार लोड होत आहेत..." : "Loading transactions..."
                    : language === "mr" ? "UPI व्यवहार प्रिंट करा" : "Print UPI transactions"}
                </button>
              </div>
              <div>
                <strong>{language === "mr" ? "एकूण रोख + UPI" : "TOTAL CASH + UPI"}</strong>
                <span>
                  ₹{formatAmount(report.payments.cash + report.payments.upi)}
                </span>
              </div>
            </section>
          )}
          {user.role === "ADMIN" && (
            <section className="daily-report-feedback">
              <h2>{language === "mr" ? "चेक-आउट अतिथी अभिप्राय" : "CHECK-OUT GUEST FEEDBACK"}</h2>
              <table>
                  <thead>
                    <tr>
                      <th>{language === "mr" ? "बुकिंग" : "Booking"}</th>
                      <th>{language === "mr" ? "बुकिंग व्यक्ती" : "Booking person"}</th>
                      <th>{language === "mr" ? "कर्मचारी" : "Staff"}</th>
                      <th>{language === "mr" ? "हाऊसकीपिंग" : "Housekeeping"}</th>
                      <th>{language === "mr" ? "सुविधा" : "Facilities"}</th>
                      <th>{language === "mr" ? "जेवण" : "Food"}</th>
                      <th>{language === "mr" ? "एकूण" : "Overall"}</th>
                      <th>{language === "mr" ? "स्थिती / अभिप्राय" : "Status / comments"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feedbackReport.map((item) => (
                      <tr key={item.booking_id}>
                        <th scope="row">{item.booking_reference}</th>
                        <td>{item.service_name || "-"}</td>
                        <td>{item.staff_rating ?? "-"}</td>
                        <td>{item.housekeeping_rating ?? "-"}</td>
                        <td>{item.facilities_rating ?? "-"}</td>
                        <td>{item.food_rating ?? "-"}</td>
                        <td>{item.overall_rating ?? "-"}</td>
                        <td>
                          {item.feedback_status === "SKIPPED"
                            ? language === "mr" ? "वगळले" : "Skipped"
                            : item.comments || "-"}
                        </td>
                      </tr>
                    ))}
                    {feedbackReport.length === 0 && (
                      <tr>
                        <td colSpan={8} className="daily-report-empty">
                          {language === "mr"
                            ? "या २४ तासांत अभिप्राय नोंद नाही"
                            : "No feedback recorded in this 24-hour period"}
                        </td>
                      </tr>
                    )}
                  </tbody>
              </table>
            </section>
          )}
          <div className="daily-report-grand-total">
            <strong>{language === "mr" ? "एकत्रित एकूण · पु / म / बा / अतिथी / एकूण / रक्कम" : "GRAND TOTAL · M / F / CH / GUEST / TOTAL / AMT"}</strong>
            <span>
              {report.totals.male} / {report.totals.female} / {report.totals.children} /{" "}
              {report.totals.otherGuests ?? 0} / {report.totals.guests} · ₹{formatAmount(report.totals.amount)}
            </span>
          </div>
          <div className="daily-report-signoff">
            <span>{language === "mr" ? "DVR :" : "DVR:"}</span>
            <span>{language === "mr" ? "सूचना :" : "Remarks:"}</span>
          </div>
          <footer className="daily-report-sheet-footer">
            {language === "mr" ? "अहवाल तयार केला:" : "Report generated"}{" "}
            {formatDateTime(report.generatedAt)}
          </footer>
        </article>
      )}
      {annualReport && reportType === "ANNUAL" && !loading && (
        <article className="daily-report-printable annual-report-printable">
          <header className="daily-report-sheet-header">
            <h1>
              {language === "mr"
                ? "ESM विश्रामगृह वार्षिक आर्थिक अहवाल"
                : "ANNUAL FINANCIAL REPORT · ESM REST HOUSE"}
            </h1>
            <p>
              {language === "mr" ? "आर्थिक वर्ष:" : "FINANCIAL YEAR:"}{" "}
              {annualReport.financialYearStart}–{annualReport.financialYearStart + 1}
            </p>
            <p className="daily-report-period">
              {formatDate(annualReport.periodStart)} – {formatDate(annualReport.periodEnd)}
            </p>
          </header>

          <section className="annual-report-section">
            <h2>{language === "mr" ? "महिन्यानुसार जमा" : "MONTHLY COLLECTION SUMMARY"}</h2>
            <table>
              <thead>
                <tr>
                  <th>{language === "mr" ? "महिना" : "Month"}</th>
                  <th>{language === "mr" ? "रोख एकूण" : "Cash Total"}</th>
                  <th>{language === "mr" ? "UPI एकूण" : "UPI Total"}</th>
                  <th>{language === "mr" ? "एकूण जमा" : "Total Collection"}</th>
                </tr>
              </thead>
              <tbody>
                {annualReport.monthly.map((month) => (
                  <tr key={month.monthStart}>
                    <th scope="row">{formatMonth(month.monthStart)}</th>
                    <td>
                      <button
                        type="button"
                        className="annual-report-amount-button"
                        disabled={annualPaymentLoading !== null}
                        onClick={() => void openAnnualPaymentDetails(month, "CASH")}
                      >
                        ₹{formatAmount(month.cashTotal)}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="annual-report-amount-button"
                        disabled={annualPaymentLoading !== null}
                        onClick={() => void openAnnualPaymentDetails(month, "UPI")}
                      >
                        ₹{formatAmount(month.upiTotal)}
                      </button>
                    </td>
                    <td className="annual-report-money">
                      ₹{formatAmount(month.totalCollection)}
                    </td>
                  </tr>
                ))}
                <tr className="daily-report-total-row">
                  <th scope="row">{language === "mr" ? "आर्थिक वर्ष एकूण" : "FINANCIAL YEAR TOTAL"}</th>
                  <td>₹{formatAmount(annualReport.totals.cash)}</td>
                  <td>₹{formatAmount(annualReport.totals.upi)}</td>
                  <td>₹{formatAmount(annualReport.totals.totalCollection)}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="annual-report-section annual-report-movement">
            <h2>{language === "mr" ? "अतिथी आवक-जावक सारांश" : "MONTHLY GUEST MOVEMENT · M / F / CHILD / GUEST / TOTAL"}</h2>
            <table>
              <thead>
                <tr>
                  <th>{language === "mr" ? "महिना" : "Month"}</th>
                  <th>{language === "mr" ? "चेक-इन · पु / स्त्री / बालक / अतिथी / एकूण" : "Check-ins · M / F / Child / Guest / Total"}</th>
                  <th>{language === "mr" ? "चेक-आउट · पु / स्त्री / बालक / अतिथी / एकूण" : "Check-outs · M / F / Child / Guest / Total"}</th>
                </tr>
              </thead>
              <tbody>
                {annualReport.monthly.map((month) => (
                  <tr key={month.monthStart}>
                    <th scope="row">{formatMonth(month.monthStart)}</th>
                    <td>
                      {month.checkIns.male} / {month.checkIns.female} / {month.checkIns.children} / {month.checkIns.otherGuests} / {month.checkIns.total}
                    </td>
                    <td>
                      {month.checkOuts.male} / {month.checkOuts.female} / {month.checkOuts.children} / {month.checkOuts.otherGuests} / {month.checkOuts.total}
                    </td>
                  </tr>
                ))}
                <tr className="daily-report-total-row">
                  <th scope="row">{language === "mr" ? "आर्थिक वर्ष एकूण" : "FINANCIAL YEAR TOTAL"}</th>
                  <td>
                    {annualReport.totals.checkIns.male} / {annualReport.totals.checkIns.female} / {annualReport.totals.checkIns.children} / {annualReport.totals.checkIns.otherGuests} / {annualReport.totals.checkIns.total}
                  </td>
                  <td>
                    {annualReport.totals.checkOuts.male} / {annualReport.totals.checkOuts.female} / {annualReport.totals.checkOuts.children} / {annualReport.totals.checkOuts.otherGuests} / {annualReport.totals.checkOuts.total}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
          {renderUpcomingAdvanceBookings()}
          <footer className="daily-report-sheet-footer">
            {language === "mr" ? "अहवाल तयार केला:" : "Report generated"}{" "}
            {formatDateTime(new Date().toISOString())}
          </footer>
        </article>
      )}
      {paymentPrint && (report || annualReport) && (
        <article className="daily-report-payment-printable">
          <header className="daily-report-payment-print-header">
            <h1>
              {language === "mr"
                ? `ESM विश्रामगृह · ${paymentPrint.method === "CASH" ? "रोख" : "UPI"} जमा व्यवहार`
                : `ESM REST HOUSE · ${paymentPrint.method} COLLECTION TRANSACTIONS`}
            </h1>
            <p>
              {language === "mr" ? "महिना:" : "MONTH:"} {paymentPrint.monthLabel}
            </p>
          </header>
          <table>
            <thead>
              <tr>
                <th>{language === "mr" ? "दिनांक" : "Date"}</th>
                <th>{language === "mr" ? "वेळ" : "Time"}</th>
                <th>{language === "mr" ? "बुकिंग क्र." : "Booking No."}</th>
                <th>{language === "mr" ? "अतिथीचे नाव" : "Guest Name"}</th>
                <th>{language === "mr" ? "रक्कम (₹)" : "Amount (₹)"}</th>
              </tr>
            </thead>
            <tbody>
              {paymentPrint.transactions.map((transaction, index) => (
                <tr key={`${transaction.bookingReference}-${transaction.paymentDate}-${transaction.paymentTime}-${index}`}>
                  <td>{formatDate(transaction.paymentDate)}</td>
                  <td>{transaction.paymentTime}</td>
                  <td>{transaction.bookingReference}</td>
                  <td>{transaction.guestName}</td>
                  <td className="daily-report-payment-amount">
                    {formatAmount(transaction.amount)}
                  </td>
                </tr>
              ))}
              {paymentPrint.transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="daily-report-empty">
                    {language === "mr"
                      ? "या महिन्यात यशस्वी व्यवहार नोंदलेले नाहीत"
                      : "No successful transactions recorded for this month"}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4}>{language === "mr" ? "एकूण जमा" : "TOTAL COLLECTED"}</th>
                <th className="daily-report-payment-amount">
                  ₹{formatAmount(paymentPrint.total)}
                </th>
              </tr>
            </tfoot>
          </table>
          <footer className="daily-report-sheet-footer">
            {language === "mr" ? "अहवाल तयार केला:" : "Report generated"}{" "}
            {formatDateTime(new Date().toISOString())}
          </footer>
        </article>
      )}
      {annualPaymentDetails && (
        <AppModal
          type="info"
          title={`${annualPaymentDetails.method} · ${annualPaymentDetails.monthLabel}`}
          onClose={() => setAnnualPaymentDetails(null)}
          showCancel={false}
          closeOnOverlayClick
        >
          <div className="annual-payment-details">
            <table>
              <thead>
                <tr>
                  <th>{language === "mr" ? "दिनांक" : "Date"}</th>
                  <th>{language === "mr" ? "वेळ" : "Time"}</th>
                  <th>{language === "mr" ? "बुकिंग क्र." : "Booking No."}</th>
                  <th>{language === "mr" ? "अतिथी" : "Guest Name"}</th>
                  <th>{language === "mr" ? "रक्कम" : "Amount"}</th>
                </tr>
              </thead>
              <tbody>
                {annualPaymentDetails.transactions.map((transaction, index) => (
                  <tr key={`${transaction.bookingReference}-${transaction.paymentDate}-${transaction.paymentTime}-${index}`}>
                    <td>{formatDate(transaction.paymentDate)}</td>
                    <td>{transaction.paymentTime}</td>
                    <td>{transaction.bookingReference}</td>
                    <td>{transaction.guestName}</td>
                    <td>₹{formatAmount(transaction.amount)}</td>
                  </tr>
                ))}
                {annualPaymentDetails.transactions.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      {language === "mr" ? "यशस्वी व्यवहार नोंदलेले नाहीत" : "No successful transactions recorded"}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>{language === "mr" ? "एकूण जमा" : "TOTAL COLLECTED"}</th>
                  <th>₹{formatAmount(annualPaymentDetails.total)}</th>
                </tr>
              </tfoot>
            </table>
            <button
              type="button"
              className="daily-report-primary annual-payment-print-button"
              onClick={() => setPaymentPrint(annualPaymentDetails)}
            >
              {language === "mr" ? "व्यवहार प्रिंट / PDF" : "Print / Save transactions PDF"}
            </button>
          </div>
        </AppModal>
      )}
    </main>
  );
}

export default DailyReport;
