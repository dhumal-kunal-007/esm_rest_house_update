import { useCallback, useEffect, useState } from "react";
import "../App.css";
import { apiFetch } from "../api";
import AppModal from "../components/AppModal";

import { useLanguage } from "../i18n/LanguageContext";

import type { User } from "../App";

interface DashboardProps {
  user: User;
  onLogout: () => void;
  onCreateUser: () => void;
  onNewBooking: () => void;
  onResumeBooking: (bookingId: string) => void;
  onAvailability: () => void;
  onCustomizeRates: () => void;
  onOpenOtherAuthorityRooms: () => void;
  onCheckIn: () => void;
  onCheckOut: () => void;
  onHousekeeping: () => void;
  onApprovals: () => void;
  onLostAndFound: () => void;
  onDailyReport: () => void;
}

interface DashboardSummary {
  totalBookings: number;
  availableBeds: number;
  occupiedBeds: number;
  todaysCheckIns: number;
  needsCleaningBeds: number;
  cleaningBeds: number;
}

interface RoomStatus {
  acRooms: number;
  vipRooms: number;
  nonAcRooms: number;
  dormitories: number;
  hallRooms: number;
}

interface CollectionSummary {
  todayTotal: number;
  todayCash: number;
  todayUpiQr: number;
  todayOther: number;
  monthCash: number;
  monthUpiQr: number;
  monthOther: number;
  monthTotal: number;
}

interface RecentBooking {
  id: string;
  booking_reference: string;
  booking_status: string;
  approval_status: string;
  booking_type: string;
  check_in_date: string;
  expected_check_out_date: string;
  created_at: string;
  can_delete: boolean;
  guest_name: string;
  room_number: string;
  resume_step: string | null;
}

interface DashboardResponse {
  success: boolean;
  summary: DashboardSummary;
  roomStatus: RoomStatus;
  recentBookings: RecentBooking[];
  message?: string;
}

const dashboardInfo = {
  ADMIN: {
    title: "Administrator Dashboard",
    subtitle: "Overall system management",
    titleMr: "प्रशासक डॅशबोर्ड",
    subtitleMr: "संपूर्ण प्रणाली व्यवस्थापन",
  },

  DY_DIRECTOR: {
    title: "Deputy Director Dashboard",
    subtitle: "VIP room booking & management",
    titleMr: "उपसंचालक डॅशबोर्ड",
    subtitleMr: "व्हीआयपी खोली बुकिंग आणि व्यवस्थापन",
  },

  SUPERINTENDENT: {
    title: "Superintendent Dashboard",
    subtitle: "AC room booking & management",
    titleMr: "अधीक्षक डॅशबोर्ड",
    subtitleMr: "वातानुकूलित खोली बुकिंग आणि व्यवस्थापन",
  },

  WELFARE_ORGANISER: {
    title: "Welfare Organizer Dashboard",
    subtitle: "AC room booking & management",
    titleMr: "कल्याण संघटक डॅशबोर्ड",
    subtitleMr: "वातानुकूलित खोली बुकिंग आणि व्यवस्थापन",
  },

  OLC_REST_HOUSE_MANAGER: {
    title: "OLC Rest House Manager Dashboard",
    subtitle: "AC room booking & management",
    titleMr: "OLC विश्रामगृह व्यवस्थापक डॅशबोर्ड",
    subtitleMr: "वातानुकूलित खोली बुकिंग आणि व्यवस्थापन",
  },

  RECEPTIONIST: {
    title: "Receptionist Dashboard",
    subtitle: "Room, bed & guest management",
    titleMr: "रिसेप्शनिस्ट डॅशबोर्ड",
    subtitleMr: "खोली, बेड आणि अतिथी व्यवस्थापन",
  },
} as const;

const formatCurrency = (amount: number): string =>
  `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Dashboard({
  user,
  onLogout,
  onCreateUser,
  onNewBooking,
  onResumeBooking,
  onAvailability,
  onCustomizeRates,
  onOpenOtherAuthorityRooms,
  onCheckIn,
  onCheckOut,
  onHousekeeping,
  onApprovals,
  onLostAndFound,
  onDailyReport,
}: DashboardProps) {
  const {
    language,
    setLanguage,
    t,
  } = useLanguage();

  const information = dashboardInfo[user.role];

  const [summary, setSummary] =
    useState<DashboardSummary>({
      totalBookings: 0,
      availableBeds: 0,
      occupiedBeds: 0,
      todaysCheckIns: 0,
      needsCleaningBeds: 0,
      cleaningBeds: 0,
    });

  const [roomStatus, setRoomStatus] =
    useState<RoomStatus>({
      acRooms: 0,
      vipRooms: 0,
      nonAcRooms: 0,
      dormitories: 0,
      hallRooms: 0,
    });

  const [recentBookings, setRecentBookings] =
    useState<RecentBooking[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [lastUpdated, setLastUpdated] =
    useState<Date | null>(null);

  const [errorMessage, setErrorMessage] =
    useState("");
  const [collections, setCollections] =
    useState<CollectionSummary | null>(null);
  const [collectionError, setCollectionError] =
    useState("");
  const [upiId, setUpiId] = useState("");
  const [upiPayee, setUpiPayee] = useState("");
  const [upiConfigLoading, setUpiConfigLoading] = useState(true);
  const [upiConfigSaving, setUpiConfigSaving] = useState(false);
  const [upiConfigMessage, setUpiConfigMessage] = useState("");
  const [upiConfigSaved, setUpiConfigSaved] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    type: "confirm" | "error";
    title: string;
    message: string;
    booking?: RecentBooking;
  } | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<string | null>(null);

  /* ============================================================
     LOAD LIVE DASHBOARD DATA
  ============================================================ */

  const loadDashboardData = useCallback(
    async () => {
      try {
        const response = await apiFetch(
          "http://localhost:5000/api/dashboard/summary",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }
        );

        const data: DashboardResponse =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              "Unable to load dashboard information."
          );
        }

        setSummary({
          totalBookings:
            Number(
              data.summary?.totalBookings
            ) || 0,

          availableBeds:
            Number(
              data.summary?.availableBeds
            ) || 0,

          occupiedBeds:
            Number(
              data.summary?.occupiedBeds
            ) || 0,

          todaysCheckIns:
            Number(
              data.summary?.todaysCheckIns
            ) || 0,

          needsCleaningBeds:
            Number(
              data.summary?.needsCleaningBeds
            ) || 0,

          cleaningBeds:
            Number(
              data.summary?.cleaningBeds
            ) || 0,
        });

        setRoomStatus({
          acRooms:
            Number(
              data.roomStatus?.acRooms
            ) || 0,

          nonAcRooms:
            Number(
              data.roomStatus?.nonAcRooms
            ) || 0,

          vipRooms:
            Number(
              data.roomStatus?.vipRooms
            ) || 0,

          dormitories:
            Number(
              data.roomStatus?.dormitories
            ) || 0,

          hallRooms:
            Number(
              data.roomStatus?.hallRooms
            ) || 0,
        });

        setRecentBookings(
          Array.isArray(
            data.recentBookings
          )
            ? data.recentBookings
            : []
        );

        if (user.role === "ADMIN") {
          try {
            const collectionResponse = await apiFetch(
              "http://localhost:5000/api/dashboard/collections",
              { cache: "no-store" }
            );
            const collectionData = await collectionResponse.json();
            if (!collectionResponse.ok || !collectionData.success) {
              throw new Error(
                collectionData.message ||
                  "Unable to load collection summary."
              );
            }
            setCollections(collectionData.collections);
            setCollectionError("");
          } catch (error) {
            setCollectionError(
              error instanceof Error
                ? error.message
                : "Unable to load collection summary."
            );
          }
        } else {
          setCollections(null);
          setCollectionError("");
        }

        setErrorMessage("");
        setLastUpdated(new Date());

      } catch (error) {
        console.error(
          "Dashboard data error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to connect to dashboard server."
        );

      } finally {
        setLoading(false);
      }
    },
    [user.role]
  );

  /* ============================================================
     INITIAL LOAD + AUTOMATIC REFRESH
  ============================================================ */

  useEffect(() => {
    loadDashboardData();

    const refreshTimer =
      window.setInterval(() => {
        loadDashboardData();
      }, 30000);

    return () => {
      window.clearInterval(
        refreshTimer
      );
    };
  }, [loadDashboardData]);

  const deleteBooking = async () => {
    const booking = deleteDialog?.booking;
    if (!booking) {
      return;
    }

    setDeletingBookingId(booking.id);
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/bookings/${booking.id}`,
        { method: "DELETE" }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to delete this booking.");
      }

      setDeleteDialog(null);
      await loadDashboardData();
    } catch (error) {
      setDeleteDialog({
        type: "error",
        title: language === "mr" ? "बुकिंग हटवता आली नाही" : "Booking Could Not Be Deleted",
        message:
          error instanceof Error
            ? error.message
            : "Unable to delete this booking.",
      });
    } finally {
      setDeletingBookingId(null);
    }
  };

  useEffect(() => {
    if (user.role !== "ADMIN") {
      return;
    }

    let cancelled = false;
    void apiFetch("http://localhost:5000/api/payments/configuration")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(
            data.message || "Unable to load UPI configuration."
          );
        }
        if (!cancelled && data.configuration) {
          setUpiId(data.configuration.upi_id ?? "");
          setUpiPayee(data.configuration.payee_name ?? "");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUpiConfigMessage(
            error instanceof Error
              ? error.message
              : "Unable to load UPI configuration."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUpiConfigLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user.role]);

  const saveUpiConfiguration = async () => {
    setUpiConfigSaving(true);
    setUpiConfigMessage("");
    setUpiConfigSaved(false);
    try {
      const response = await apiFetch(
        "http://localhost:5000/api/payments/configuration",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            upi_id: upiId,
            payee_name: upiPayee,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to save UPI configuration."
        );
      }
      setUpiId(data.configuration.upi_id);
      setUpiPayee(data.configuration.payee_name);
      setUpiConfigMessage(
        language === "mr"
          ? "UPI तपशील यशस्वीरित्या जतन केले."
          : "UPI configuration saved successfully."
      );
      setUpiConfigSaved(true);
    } catch (error) {
      setUpiConfigMessage(
        error instanceof Error
          ? error.message
          : "Unable to save UPI configuration."
      );
    } finally {
      setUpiConfigSaving(false);
    }
  };

  /* ============================================================
     DATE FORMATTING
  ============================================================ */

  const formatDate = (
    value: string
  ) => {
    if (!value) {
      return "-";
    }

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return value;
    }

    return date.toLocaleDateString(
      language === "mr"
        ? "mr-IN"
        : "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  /* ============================================================
     BOOKING STATUS
  ============================================================ */

  const getBookingStatus = (
    booking: RecentBooking
  ) => {
    const bookingStatus =
      String(
        booking.booking_status || ""
      ).toUpperCase();

    const approvalStatus =
      String(
        booking.approval_status || ""
      ).toUpperCase();

    if (
      bookingStatus.includes(
        "CHECK"
      ) ||
      bookingStatus === "OCCUPIED"
    ) {
      return {
        label:
          language === "mr"
            ? "चेक-इन झाले"
            : "Checked In",
        className:
          "dashboard-status dashboard-status-green",
      };
    }

    if (
      bookingStatus === "ALLOTTED"
    ) {
      return {
        label:
          language === "mr"
            ? "वाटप झाले"
            : "Allotted",
        className:
          "dashboard-status dashboard-status-blue",
      };
    }

    if (
      bookingStatus.includes(
        "CANCEL"
      )
    ) {
      return {
        label:
          language === "mr"
            ? "रद्द केले"
            : "Cancelled",
        className:
          "dashboard-status dashboard-status-red",
      };
    }

    if (
      approvalStatus === "REJECTED"
    ) {
      return {
        label:
          language === "mr"
            ? "नाकारले"
            : "Rejected",
        className:
          "dashboard-status dashboard-status-red",
      };
    }

    if (
      approvalStatus === "APPROVED"
    ) {
      return {
        label:
          language === "mr"
            ? "मंजूर"
            : "Approved",
        className:
          "dashboard-status dashboard-status-green",
      };
    }

    return {
      label:
        language === "mr"
          ? "प्रलंबित"
          : "Pending",
      className:
        "dashboard-status dashboard-status-amber",
    };
  };

  /* ============================================================
     CURRENT DATE
  ============================================================ */

  const today = new Date();

  const formattedToday =
    today.toLocaleDateString(
      language === "mr"
        ? "mr-IN"
        : "en-IN",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }
    );

  /* ============================================================
     AUTHORITY APPROVAL ACCESS
  ============================================================ */

  const canApproveBookings =
    user.role ===
      "DY_DIRECTOR" ||
    user.role ===
      "SUPERINTENDENT" ||
    user.role ===
      "WELFARE_ORGANISER" ||
    user.role ===
      "OLC_REST_HOUSE_MANAGER";

  const canCreateBookings =
    user.role !== "ADMIN";

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <main className="modern-dashboard">

      {/* ============================================================
          HEADER
      ============================================================ */}

      <header className="modern-dashboard-header">

        <div className="modern-brand">

          <div className="modern-brand-mark">
            ESM
          </div>

          <div className="modern-brand-text">

            <h1>
              ESM REST HOUSE
            </h1>

            <p>
              {language === "mr"
                ? "बुकिंग आणि व्यवस्थापन प्रणाली"
                : "Booking & Management System"}
            </p>

          </div>

        </div>

        <div className="modern-header-right">

          {/* LANGUAGE SWITCHER */}

          <div className="language-switcher">

            <button
              type="button"
              className={
                language === "en"
                  ? "language-button active"
                  : "language-button"
              }
              onClick={() =>
                setLanguage("en")
              }
            >
              English
            </button>

            <span className="language-divider">
              |
            </span>

            <button
              type="button"
              className={
                language === "mr"
                  ? "language-button active"
                  : "language-button"
              }
              onClick={() =>
                setLanguage("mr")
              }
            >
              मराठी
            </button>

          </div>

          <div className="modern-header-date">

            <span>
              {language === "mr"
                ? "आज"
                : "TODAY"}
            </span>

            <strong>
              {formattedToday}
            </strong>

          </div>

          <div className="modern-user">

            <div className="modern-user-avatar">
              {user.name
                ?.charAt(0)
                .toUpperCase() || "U"}
            </div>

            <div className="modern-user-details">

              <strong>
                {user.name}
              </strong>

              <span>
                {language === "mr"
                  ? (
                      user.role ===
                      "ADMIN"
                        ? "प्रशासक"
                        : user.role ===
                          "DY_DIRECTOR"
                        ? "उपसंचालक"
                        : user.role ===
                          "SUPERINTENDENT"
                        ? "अधीक्षक"
                        : user.role ===
                          "WELFARE_ORGANISER"
                        ? "कल्याण संघटक"
                        : user.role ===
                          "OLC_REST_HOUSE_MANAGER"
                        ? "OLC विश्रामगृह व्यवस्थापक"
                        : "रिसेप्शनिस्ट"
                    )
                  : user.role}
              </span>

            </div>

          </div>

          <button
            type="button"
            className="modern-logout"
            onClick={onLogout}
          >
            {t("common", "logout")}
          </button>

        </div>

      </header>

      {/* ============================================================
          MAIN
      ============================================================ */}

      <section className="modern-dashboard-content">

        {/* ============================================================
            WELCOME
        ============================================================ */}

        <section className="dashboard-welcome">

          <div>

            <span className="dashboard-eyebrow">
              {language === "mr"
                ? "पुन्हा स्वागत आहे"
                : "WELCOME BACK"}
            </span>

            <h2>
              {language === "mr"
                ? information.titleMr
                : information.title}
            </h2>

            <p>
              {language === "mr"
                ? information.subtitleMr
                : information.subtitle}
            </p>

          </div>

          <div className="dashboard-welcome-meta">

            <strong>
              {formattedToday}
            </strong>

            <span>
              {language === "mr"
                ? "ESM विश्रामगृह व्यवस्थापन पोर्टल"
                : "ESM Rest House Management Portal"}
            </span>

          </div>

        </section>

        {/* ============================================================
            LIVE DATA INDICATOR
        ============================================================ */}

        <div className="dashboard-live-bar">

          <div className="dashboard-live-left">

            <span className="dashboard-live-dot" />

            <strong>
              {language === "mr"
                ? "थेट प्रणाली माहिती"
                : "Live System Data"}
            </strong>

            <span>
              {language === "mr"
                ? "PostgreSQL शी जोडलेले"
                : "Connected to PostgreSQL"}
            </span>

          </div>

          <div className="dashboard-live-right">

            {loading
              ? language === "mr"
                ? "लोड होत आहे..."
                : "Loading..."
              : lastUpdated
                ? language === "mr"
                  ? `अपडेट: ${lastUpdated.toLocaleTimeString(
                      "mr-IN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      }
                    )}`
                  : `Updated ${lastUpdated.toLocaleTimeString(
                      "en-IN",
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      }
                    )}`
                : language === "mr"
                  ? "अपडेटची प्रतीक्षा"
                  : "Waiting for update"}

            <button
              type="button"
              onClick={
                loadDashboardData
              }
              disabled={loading}
              className="dashboard-refresh-button"
            >
              {t("common", "refresh")}
            </button>

          </div>

        </div>

        {/* ============================================================
            ERROR
        ============================================================ */}

        {errorMessage && (

          <div className="dashboard-error">

            <strong>
              {language === "mr"
                ? "डॅशबोर्ड माहिती उपलब्ध नाही"
                : "Dashboard data unavailable"}
            </strong>

            <span>
              {errorMessage}
            </span>

            <button
              type="button"
              onClick={
                loadDashboardData
              }
            >
              {language === "mr"
                ? "पुन्हा प्रयत्न करा"
                : "Try Again"}
            </button>

          </div>

        )}

        {/* ============================================================
            LIVE STATISTICS
        ============================================================ */}

        <section className="dashboard-stat-grid">

          {/* TOTAL BOOKINGS */}

          <article className="dashboard-stat-card stat-blue">

            <div className="dashboard-stat-top">

              <div className="dashboard-stat-icon">
                B
              </div>

              <span className="dashboard-stat-badge">
                {language === "mr"
                  ? "थेट"
                  : "LIVE"}
              </span>

            </div>

            <span className="dashboard-stat-label">
              {language === "mr"
                ? "एकूण बुकिंग"
                : "Total Bookings"}
            </span>

            <strong className="dashboard-stat-value">
              {loading
                ? "—"
                : summary.totalBookings}
            </strong>

            <span className="dashboard-stat-description">
              {language === "mr"
                ? "प्रणालीमध्ये नोंदवलेली सर्व बुकिंग"
                : "All bookings recorded in the system"}
            </span>

          </article>

          <article className="dashboard-stat-card stat-green">
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon">AB</div>
              <span className="dashboard-stat-badge">
                {language === "mr" ? "थेट" : "LIVE"}
              </span>
            </div>
            <span className="dashboard-stat-label">
              {language === "mr" ? "उपलब्ध बेड" : "Available Beds"}
            </span>
            <strong className="dashboard-stat-value">
              {loading ? "—" : summary.availableBeds}
            </strong>
            <span className="dashboard-stat-description">
              {language === "mr"
                ? "सध्या उपलब्ध असलेले बेड"
                : "Beds currently available"}
            </span>
          </article>

          <article className="dashboard-stat-card stat-red">
            <div className="dashboard-stat-top">
              <div className="dashboard-stat-icon">OB</div>
              <span className="dashboard-stat-badge">
                {language === "mr" ? "थेट" : "LIVE"}
              </span>
            </div>
            <span className="dashboard-stat-label">
              {language === "mr" ? "व्यापलेले बेड" : "Occupied Beds"}
            </span>
            <strong className="dashboard-stat-value">
              {loading ? "—" : summary.occupiedBeds}
            </strong>
            <span className="dashboard-stat-description">
              {language === "mr"
                ? "सध्या अतिथींनी वापरलेले बेड"
                : "Beds currently occupied by guests"}
            </span>
          </article>

          {/* TODAY CHECK-IN */}

          <article className="dashboard-stat-card stat-purple">

            <div className="dashboard-stat-top">

              <div className="dashboard-stat-icon">
                IN
              </div>

              <span className="dashboard-stat-badge">
                {language === "mr"
                  ? "आज"
                  : "TODAY"}
              </span>

            </div>

            <span className="dashboard-stat-label">
              {language === "mr"
                ? "आजचे चेक-इन"
                : "Today's Check-ins"}
            </span>

            <strong className="dashboard-stat-value">
              {loading
                ? "—"
                : summary.todaysCheckIns}
            </strong>

            <span className="dashboard-stat-description">
              {language === "mr"
                ? "आज चेक-इन केलेले अतिथी"
                : "Guests checked in today"}
            </span>

          </article>

        </section>

        {user.role === "ADMIN" && (
          <section className="booking-card">
            <div className="booking-section-title">
              <span>₹</span>
              <div>
                <h2>
                  {language === "mr"
                    ? "आजचे आणि मासिक संकलन"
                    : "Daily and Monthly Collections"}
                </h2>
                <p>
                  {language === "mr"
                    ? "फक्त यशस्वी नोंदवलेली पेमेंट्स"
                    : "Successful recorded payments only"}
                </p>
              </div>
            </div>
            {collectionError ? (
              <p role="alert" className="dashboard-error">
                {collectionError}
              </p>
            ) : collections ? (
              <div className="dashboard-stat-grid">
                <article className="dashboard-stat-card stat-green">
                  <span className="dashboard-stat-label">Today's Collection</span>
                  <strong className="dashboard-stat-value">
                    {formatCurrency(collections.todayTotal)}
                  </strong>
                  <span className="dashboard-stat-description">
                    Cash: {formatCurrency(collections.todayCash)}
                  </span>
                  <span className="dashboard-stat-description">
                    UPI / QR: {formatCurrency(collections.todayUpiQr)}
                  </span>
                  <span className="dashboard-stat-description">
                    Online / cheque: {formatCurrency(collections.todayOther)}
                  </span>
                </article>
                <article className="dashboard-stat-card stat-blue">
                  <span className="dashboard-stat-label">This Month</span>
                  <strong className="dashboard-stat-value">
                    {formatCurrency(collections.monthTotal)}
                  </strong>
                  <span className="dashboard-stat-description">
                    Cash: {formatCurrency(collections.monthCash)}
                  </span>
                  <span className="dashboard-stat-description">
                    UPI / QR: {formatCurrency(collections.monthUpiQr)}
                  </span>
                  <span className="dashboard-stat-description">
                    Online / cheque: {formatCurrency(collections.monthOther)}
                  </span>
                </article>
              </div>
            ) : (
              <p>{loading ? "Loading collections…" : "No collection data."}</p>
            )}
          </section>
        )}

        {/* ============================================================
            HOUSEKEEPING STATUS
        ============================================================ */}

        <section className="dashboard-attention-grid">

          <div className="dashboard-attention-card attention-red">

            <div>

              <span>
                {language === "mr"
                  ? "हाऊसकीपिंग"
                  : "HOUSEKEEPING"}
              </span>

              <strong>
                {loading
                  ? "—"
                  : summary.needsCleaningBeds}
              </strong>

              <p>
                {language === "mr"
                  ? "हाऊसकीपिंगची प्रतीक्षा करणाऱ्या खोल्या / बेड"
                  : "Rooms / beds waiting for housekeeping"}
              </p>

            </div>

            <span className="attention-indicator">
              {language === "mr"
                ? "साफसफाई आवश्यक"
                : "NEEDS CLEANING"}
            </span>

          </div>

          <div className="dashboard-attention-card attention-amber">

            <div>

              <span>
                {language === "mr"
                  ? "साफसफाई सुरू"
                  : "CLEANING IN PROGRESS"}
              </span>

              <strong>
                {loading
                  ? "—"
                  : summary.cleaningBeds}
              </strong>

              <p>
                {language === "mr"
                  ? "सध्या साफ होत असलेल्या खोल्या / बेड"
                  : "Rooms / beds currently being cleaned"}
              </p>

            </div>

            <span className="attention-indicator">
              {language === "mr"
                ? "प्रगतीपथावर"
                : "IN PROGRESS"}
            </span>

          </div>

        </section>

        {/* ============================================================
            OPERATIONS + ROOM STATUS
        ============================================================ */}

        <section className="dashboard-main-grid">

          {/* QUICK ACTIONS */}

          <section className="dashboard-section-card">

            <div className="dashboard-section-header">

              <div>

                <span className="dashboard-eyebrow">
                  {language === "mr"
                    ? "ऑपरेशन्स"
                    : "OPERATIONS"}
                </span>

                <h3>
                  {language === "mr"
                    ? "जलद कृती"
                    : "Quick Actions"}
                </h3>

                <p>
                  {language === "mr"
                    ? "वारंवार वापरली जाणारी व्यवस्थापन कार्ये"
                    : "Frequently used management functions"}
                </p>

              </div>

            </div>

            <div className="dashboard-action-grid">

              <button
                type="button"
                className="dashboard-action action-cyan"
                onClick={onDailyReport}
              >
                <span className="action-symbol">DR</span>
                <span>
                  <strong>
                    {language === "mr" ? "दैनिक अहवाल पहा" : "View Daily Report"}
                  </strong>
                  <small>
                    {language === "mr"
                      ? "खोलीनुसार अतिथी आणि रिक्तता"
                      : "Room-wise occupancy and vacancies"}
                  </small>
                </span>
                <b>→</b>
              </button>

              {/* NEW BOOKING */}

              {canCreateBookings && (
                <button
                  type="button"
                  className="dashboard-action action-blue"
                  onClick={
                    onNewBooking
                  }
                >

                  <span className="action-symbol">
                    +
                  </span>

                  <span>

                    <strong>
                      {t("dashboard", "newBooking")}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "नवीन अतिथी बुकिंग तयार करा"
                        : "Create a new guest booking"}
                    </small>

                  </span>

                  <b>
                    →
                  </b>

                </button>
              )}

              {/* AVAILABILITY */}

              <button
                type="button"
                className="dashboard-action action-green"
                onClick={
                  onAvailability
                }
              >

                <span className="action-symbol">
                  A
                </span>

                <span>

                  <strong>
                    {t("dashboard", "availability")}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "खोल्या आणि बेड पहा"
                      : "View rooms and beds"}
                  </small>

                </span>

                <b>
                  →
                </b>

              </button>

              {user.role === "ADMIN" && (
                <button
                  type="button"
                  className="dashboard-action action-gold"
                  onClick={onCustomizeRates}
                >
                  <span className="action-symbol">₹</span>
                  <span>
                    <strong>
                      {language === "mr" ? "खोली आणि दर सानुकूलित करा" : "Customize Room and Rates"}
                    </strong>
                    <small>
                      {language === "mr"
                        ? "खोलीची क्षमता आणि दर व्यवस्थापित करा"
                        : "Manage room capacities and approved rates"}
                    </small>
                  </span>
                  <b>→</b>
                </button>
              )}

              {/* PENDING APPROVALS */}

              {canApproveBookings && (

                <button
                  type="button"
                  className="dashboard-action action-purple"
                  onClick={
                    onApprovals
                  }
                >

                  <span className="action-symbol">
                    ✓
                  </span>

                  <span>

                    <strong>
                      {t("dashboard", "approvals")}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "खोली बुकिंगच्या मंजुरी तपासा"
                        : "Review room booking approvals"}
                    </small>

                  </span>

                  <b>
                    →
                  </b>

                </button>

              )}

              {/* AUTHORITY ROOMS */}

              {user.role ===
                "RECEPTIONIST" && (

                <button
                  type="button"
                  className="dashboard-action action-purple"
                  onClick={
                    onOpenOtherAuthorityRooms
                  }
                >

                  <span className="action-symbol">
                    R
                  </span>

                  <span>

                    <strong>
                      {language === "mr"
                        ? "अधिकारी कक्ष"
                        : "Authority Rooms"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "अधिकारी कक्ष प्रवेश व्यवस्थापित करा"
                        : "Manage authority room access"}
                    </small>

                  </span>

                  <b>
                    →
                  </b>

                </button>

              )}

              {/* CHECK-IN */}

              <button
                type="button"
                className="dashboard-action action-cyan"
                onClick={
                  onCheckIn
                }
              >

                <span className="action-symbol">
                  IN
                </span>

                <span>

                  <strong>
                    {t("dashboard", "checkIn")}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "येणाऱ्या अतिथींची नोंदणी करा"
                      : "Register arriving guests"}
                  </small>

                </span>

                <b>
                  →
                </b>

              </button>

              {(user.role === "ADMIN" || user.role === "RECEPTIONIST") && (
                <button
                  type="button"
                  className="dashboard-action action-gold"
                  onClick={onCheckIn}
                >
                  <span className="action-symbol">PC</span>
                  <span>
                    <strong>
                      {language === "mr" ? "प्री-चेक-इन" : "Pre-Checkin"}
                    </strong>
                    <small>
                      {language === "mr"
                        ? "वास्तविक आगमन तारीखसह मॅन्युअल नोंद"
                        : "Manual arrival entry for actual check-in date"}
                    </small>
                  </span>
                  <b>→</b>
                </button>
              )}

              {/* CHECK-OUT */}

              <button
                type="button"
                className="dashboard-action action-orange"
                onClick={
                  onCheckOut
                }
              >

                <span className="action-symbol">
                  OUT
                </span>

                <span>

                  <strong>
                    {t("dashboard", "checkOut")}
                  </strong>

                  <small>
                    {language === "mr"
                      ? "अतिथींचे प्रस्थान पूर्ण करा"
                      : "Complete guest departure"}
                  </small>

                </span>

                <b>
                  →
                </b>

              </button>

              {/* HOUSEKEEPING */}

              {user.role ===
                "RECEPTIONIST" && (

                <button
                  type="button"
                  className="dashboard-action action-amber"
                  onClick={
                    onHousekeeping
                  }
                >

                  <span className="action-symbol">
                    H
                  </span>

                  <span>

                    <strong>
                      {t("dashboard", "housekeeping")}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "साफसफाईची कामे व्यवस्थापित करा"
                        : "Manage cleaning tasks"}
                    </small>

                  </span>

                  <b>
                    →
                  </b>

                </button>

              )}

              {/* LOST & FOUND */}

              {user.role ===
                "RECEPTIONIST" && (

                <button
                  type="button"
                  className="dashboard-action action-orange"
                  onClick={
                    onLostAndFound
                  }
                >

                  <span className="action-symbol">
                    LF
                  </span>

                  <span>

                    <strong>
                      {language === "mr"
                        ? "हरवलेली वस्तू"
                        : "Lost & Found"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "सापडलेल्या वस्तूंची नोंद व परतावा व्यवस्थापित करा"
                        : "Record and return found guest items"}
                    </small>

                  </span>

                  <b>
                    →
                  </b>

                </button>

              )}

            </div>

          </section>

          {user.role === "ADMIN" && (
            <section className="dashboard-section-card dashboard-payment-config">
              <div className="dashboard-section-header">
                <div>
                  <span className="dashboard-eyebrow">
                    {language === "mr" ? "पेमेंट" : "PAYMENTS"}
                  </span>
                  <h3>
                    {language === "mr"
                      ? "UPI पेमेंट तपशील"
                      : "UPI Payment Setup"}
                  </h3>
                  <p>
                    {language === "mr"
                      ? "ऑनलाइन पेमेंट QR साठी वापरला जाणारा UPI आयडी आणि प्राप्तकर्त्याचे नाव सेट करा."
                      : "Set the UPI ID and payee name used for online payment QR codes."}
                  </p>
                </div>
              </div>
              <div className="dashboard-payment-config-body">
                {upiConfigLoading ? (
                  <p role="status">
                    {language === "mr"
                      ? "UPI तपशील लोड होत आहेत..."
                      : "Loading UPI configuration..."}
                  </p>
                ) : (
                  <>
                    <div className="dashboard-payment-config-fields">
                      <label className="dashboard-payment-field">
                        <span>{language === "mr" ? "UPI आयडी" : "UPI ID"}</span>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="name@bank"
                          value={upiId}
                          onChange={(event) => {
                            setUpiId(event.target.value);
                            setUpiConfigSaved(false);
                            setUpiConfigMessage("");
                          }}
                        />
                      </label>
                      <label className="dashboard-payment-field">
                        <span>
                          {language === "mr" ? "प्राप्तकर्त्याचे नाव" : "Payee name"}
                        </span>
                        <input
                          type="text"
                          autoComplete="off"
                          value={upiPayee}
                          onChange={(event) => {
                            setUpiPayee(event.target.value);
                            setUpiConfigSaved(false);
                            setUpiConfigMessage("");
                          }}
                        />
                      </label>
                    </div>
                    <div className="dashboard-payment-config-footer">
                      <button
                        type="button"
                        className="dashboard-payment-save"
                        onClick={() => void saveUpiConfiguration()}
                        disabled={upiConfigSaving}
                      >
                        {upiConfigSaving
                          ? language === "mr"
                            ? "जतन होत आहे..."
                            : "Saving..."
                          : language === "mr"
                            ? "UPI तपशील जतन करा"
                            : "Save UPI details"}
                      </button>
                      {upiConfigMessage && (
                        <p
                          role="status"
                          className={
                            upiConfigSaved
                              ? "dashboard-payment-message success"
                              : "dashboard-payment-message"
                          }
                        >
                          {upiConfigMessage}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* ROOM STATUS */}

          <section className="dashboard-section-card">

            <div className="dashboard-section-header">

              <div>

                <span className="dashboard-eyebrow">
                  {language === "mr"
                    ? "थेट आढावा"
                    : "LIVE OVERVIEW"}
                </span>

                <h3>
                  {language === "mr"
                    ? "खोलींची माहिती"
                    : "Room Inventory"}
                </h3>

                <p>
                  {language === "mr"
                    ? "सध्याची निवास व्यवस्था"
                    : "Current accommodation structure"}
                </p>

              </div>

            </div>

            <div className="room-status-list">

              {/* AC ROOMS */}

              <div className="room-status-item">

                <div className="room-status-name">

                  <span className="room-status-dot dot-blue" />

                  <div>

                    <strong>
                      {language === "mr"
                        ? "वातानुकूलित खोल्या"
                        : "AC Rooms"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "प्रीमियम निवास"
                        : "Premium accommodation"}
                    </small>

                  </div>

                </div>

                <strong className="room-status-number">
                  {loading
                    ? "—"
                    : roomStatus.acRooms}
                </strong>

              </div>

              {/* VIP ROOMS */}

              <div className="room-status-item">

                <div className="room-status-name">

                  <span className="room-status-dot dot-orange" />

                  <div>

                    <strong>
                      {language === "mr" ? "व्हीआयपी खोल्या" : "VIP Rooms"}
                    </strong>

                    <small>
                      {language === "mr" ? "विशेष निवास" : "Special accommodation"}
                    </small>

                  </div>

                </div>

                <strong className="room-status-number">
                  {loading ? "—" : roomStatus.vipRooms}
                </strong>

              </div>

              {/* NON AC */}

              <div className="room-status-item">

                <div className="room-status-name">

                  <span className="room-status-dot dot-green" />

                  <div>

                    <strong>
                      {language === "mr"
                        ? "विनावातानुकूलित खोल्या"
                        : "Non-AC Rooms"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "सामान्य निवास"
                        : "Standard accommodation"}
                    </small>

                  </div>

                </div>

                <strong className="room-status-number">
                  {loading
                    ? "—"
                    : roomStatus.nonAcRooms}
                </strong>

              </div>

              {/* DORMITORIES */}

              <div className="room-status-item">

                <div className="room-status-name">

                  <span className="room-status-dot dot-purple" />

                  <div>

                    <strong>
                      {language === "mr"
                        ? "वसतिगृहे"
                        : "Dormitories"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "सामायिक निवास"
                        : "Shared accommodation"}
                    </small>

                  </div>

                </div>

                <strong className="room-status-number">
                  {loading
                    ? "—"
                    : roomStatus.dormitories}
                </strong>

              </div>

              {/* HALL */}

              <div className="room-status-item">

                <div className="room-status-name">

                  <span className="room-status-dot dot-orange" />

                  <div>

                    <strong>
                      {language === "mr"
                        ? "सभागृह"
                        : "Hall"}
                    </strong>

                    <small>
                      {language === "mr"
                        ? "सामायिक निवास"
                        : "Common accommodation"}
                    </small>

                  </div>

                </div>

                <strong className="room-status-number">
                  {loading
                    ? "—"
                    : roomStatus.hallRooms}
                </strong>

              </div>

            </div>

          </section>

        </section>

        {/* ============================================================
            RECENT BOOKINGS
        ============================================================ */}

        <section className="dashboard-section-card dashboard-recent-card">

          <div className="dashboard-section-header">

            <div>

              <span className="dashboard-eyebrow">
                {language === "mr"
                  ? "क्रियाकलाप"
                  : "ACTIVITY"}
              </span>

              <h3>
                {language === "mr"
                  ? "अलीकडील बुकिंग"
                  : "Recent Bookings"}
              </h3>

              <p>
                {language === "mr"
                  ? "PostgreSQL मधील अलीकडील बुकिंग माहिती"
                  : "Latest booking activity from PostgreSQL"}
              </p>

            </div>

            {canCreateBookings && (
              <button
                type="button"
                className="dashboard-new-booking-button"
                onClick={
                  onNewBooking
                }
              >
                +{" "}
                {language === "mr"
                  ? "नवीन बुकिंग"
                  : "New Booking"}
              </button>
            )}

          </div>

          {loading ? (

            <div className="dashboard-table-message">
              {language === "mr"
                ? "थेट बुकिंग माहिती लोड होत आहे..."
                : "Loading live booking activity..."}
            </div>

          ) : recentBookings.length ===
            0 ? (

            <div className="dashboard-table-message">
              {language === "mr"
                ? "अद्याप कोणतीही बुकिंग नोंदवलेली नाही."
                : "No bookings have been recorded yet."}
            </div>

          ) : (

            <div className="dashboard-booking-table">

              <div className="dashboard-booking-row dashboard-booking-header">

                <span>
                  {language === "mr"
                    ? "बुकिंग क्रमांक"
                    : "BOOKING ID"}
                </span>

                <span>
                  {language === "mr"
                    ? "अतिथी"
                    : "GUEST"}
                </span>

                <span>
                  {language === "mr"
                    ? "खोली"
                    : "ROOM"}
                </span>

                <span>
                  {language === "mr"
                    ? "प्रकार"
                    : "TYPE"}
                </span>

                <span>
                  {language === "mr"
                    ? "चेक-इन"
                    : "CHECK-IN"}
                </span>

                <span>
                  {language === "mr"
                    ? "स्थिती"
                    : "STATUS"}
                </span>

              </div>

              {recentBookings.map(
                (booking) => {

                  const status =
                    getBookingStatus(
                      booking
                    );

                  return (

                    <div
                      key={booking.id}
                      className="dashboard-booking-row"
                    >

                      <span className="booking-reference">
                        {
                          booking.booking_reference
                        }
                      </span>

                      <span className="booking-guest">
                        {
                          booking.guest_name
                        }
                      </span>

                      <span>
                        {
                          booking.room_number
                        }
                      </span>

                      <span className="booking-type">
                        {
                          language === "mr"
                            ? booking.booking_type ===
                              "CURRENT"
                              ? "वर्तमान"
                              : booking.booking_type ===
                                "ADVANCE"
                              ? "आगाऊ"
                              : booking.booking_type
                            : booking.booking_type
                        }
                      </span>

                      <span>
                        {
                          formatDate(
                            booking.check_in_date
                          )
                        }
                      </span>

                      <span>

                        <span
                          className={
                            status.className
                          }
                        >
                          {
                            status.label
                          }
                        </span>

                        {booking.resume_step && (
                          <div className="dashboard-resume-action">
                            <small>
                              {booking.resume_step === "PAYMENT"
                                ? language === "mr"
                                  ? "मंजूर — पेमेंट सुरू ठेवा"
                                  : "Approved — Continue to Payment"
                                : booking.resume_step === "INVOICE"
                                ? language === "mr"
                                  ? "पेमेंट झाले — इनव्हॉइस सुरू ठेवा"
                                  : "Payment recorded — Continue to Invoice"
                                : booking.resume_step === "ROOM_LOCKED"
                                ? language === "mr"
                                  ? "इनव्हॉइस झाले — रूम लॉक सुरू ठेवा"
                                  : "Invoice generated — Continue to Room Lock"
                                : language === "mr"
                                ? `अपूर्ण — पायरी ${
                                    booking.resume_step === "AVAILABILITY"
                                      ? 1
                                      : booking.resume_step === "GUEST_TYPE"
                                        ? 2
                                        : booking.resume_step === "RATE"
                                          ? 3
                                          : 4
                                  } पासून पुढे जा`
                                : `Incomplete — Continue from Step ${
                                    booking.resume_step === "AVAILABILITY"
                                      ? 1
                                      : booking.resume_step === "GUEST_TYPE"
                                        ? 2
                                        : booking.resume_step === "RATE"
                                          ? 3
                                          : 4
                                  }`}
                            </small>
                            <button
                              type="button"
                              className="dashboard-continue-booking"
                              onClick={() =>
                                onResumeBooking(booking.id)
                              }
                            >
                              {booking.resume_step === "PAYMENT"
                                ? language === "mr"
                                  ? "पेमेंट सुरू ठेवा"
                                  : "Continue to Payment"
                                : booking.resume_step === "INVOICE"
                                ? language === "mr"
                                  ? "इनव्हॉइस सुरू ठेवा"
                                  : "Continue to Invoice"
                                : booking.resume_step === "ROOM_LOCKED"
                                ? language === "mr"
                                  ? "रूम लॉक सुरू ठेवा"
                                  : "Continue to Room Lock"
                                : language === "mr"
                                ? "बुकिंग पुढे सुरू ठेवा"
                                : "Continue Booking"}
                            </button>
                          </div>
                        )}

                        {booking.can_delete && (
                            <div className="dashboard-resume-action">
                              <button
                                type="button"
                                className="dashboard-delete-booking"
                                onClick={() =>
                                  setDeleteDialog({
                                    type: "confirm",
                                    title:
                                      language === "mr"
                                        ? "बुकिंग हटवायची?"
                                        : "Delete Booking?",
                                    message:
                                      language === "mr"
                                        ? `${booking.booking_reference} ही अपूर्ण/प्रलंबित बुकिंग कायमची हटवली जाईल.`
                                        : `${booking.booking_reference} will be permanently deleted. This is available only for incomplete or pending bookings.`,
                                    booking,
                                  })
                                }
                                disabled={deletingBookingId === booking.id}
                              >
                                {language === "mr" ? "बुकिंग हटवा" : "Delete Booking"}
                              </button>
                            </div>
                          )}

                      </span>

                    </div>

                  );
                }
              )}

            </div>

          )}

        </section>

        {/* ============================================================
            ADMINISTRATION
        ============================================================ */}

        <section className="dashboard-admin-section">

          <div>

            <span className="dashboard-eyebrow">
              {language === "mr"
                ? "प्रशासन"
                : "ADMINISTRATION"}
            </span>

            <h3>
              {language === "mr"
                ? "वापरकर्ता व्यवस्थापन"
                : "User Management"}
            </h3>

            <p>
              {language === "mr"
                ? "प्रणाली वापरकर्ते आणि प्रवेश परवानग्या व्यवस्थापित करा."
                : "Manage system users and access permissions."}
            </p>

          </div>

          {user.role ===
            "ADMIN" ? (

            <button
              type="button"
              className="dashboard-admin-button"
              onClick={
                onCreateUser
              }
            >
              {language === "mr"
                ? "वापरकर्ते व्यवस्थापित करा"
                : "Manage Users"}
            </button>

          ) : (

            <span className="dashboard-admin-restricted">
              {language === "mr"
                ? "प्रशासक प्रवेश आवश्यक आहे"
                : "Administrator access required"}
            </span>

          )}

        </section>

      </section>

      {/* ============================================================
          FOOTER
      ============================================================ */}

      <footer className="modern-dashboard-footer">

        <span>
          ESM REST HOUSE
        </span>

        <span>
          |
        </span>

        <span>
          {language === "mr"
            ? "सुरक्षित व्यवस्थापन पोर्टल"
            : "Secure Management Portal"}
        </span>

        <span>
          |
        </span>

        <span>
          © {new Date().getFullYear()}
        </span>

      </footer>

      {deleteDialog && (
        <AppModal
          type={deleteDialog.type}
          title={deleteDialog.title}
          message={deleteDialog.message}
          confirmText={
            deleteDialog.type === "error"
              ? language === "mr" ? "ठीक आहे" : "OK"
              : language === "mr" ? "हटवा" : "Delete"
          }
          cancelText={language === "mr" ? "रद्द करा" : "Cancel"}
          loading={deletingBookingId !== null}
          showCancel={deleteDialog.type === "confirm"}
          onConfirm={() => {
            if (deleteDialog.type === "confirm") {
              void deleteBooking();
            } else {
              setDeleteDialog(null);
            }
          }}
          onCancel={() => setDeleteDialog(null)}
          onClose={() => setDeleteDialog(null)}
        />
      )}

    </main>
  );
}

export default Dashboard;