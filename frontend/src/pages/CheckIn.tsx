import {
  useEffect,
  useState,
} from "react";

import AppModal from "../components/AppModal";
import BrandLogo from "../components/BrandLogo";
import { apiFetch } from "../api";
import type { AppModalType } from "../components/AppModal";
import { useLanguage } from "../i18n/LanguageContext";

/* =========================================
   PROPS
========================================= */

interface CheckInProps {
  userId: string;
  userName: string;
  userRole?: string;
  onBack: () => void;
}

/* =========================================
   GUEST DATA
========================================= */

interface AllottedGuest {
  allotment_id: string;
  booking_id: string;
  booking_reference: string;
  booking_person_name?: string | null;
  guest_id: string;
  guest_name: string;
  mobile_number: string | null;
  room_id: string;
  room_number: string;
  bed_id: string | null;
  bed_number: number | null;
  check_in_date: string;
  expected_check_out_date: string;
  check_in_available: boolean;
  approval_status: string;
  allotment_status: string;
  check_in_status:
    | "NOT_CHECKED_IN"
    | "CHECKED_IN";
  room_group_guests?: AllottedGuest[];
}

/* =========================================
   CHECK-IN PAGE
========================================= */

function CheckIn({
  userId,
  userName,
  userRole,
  onBack,
}: CheckInProps) {
  const { language, setLanguage } =
    useLanguage();

  const isMarathi =
    language === "mr";

  const tr = (
    english: string,
    marathi: string
  ) =>
    isMarathi
      ? marathi
      : english;

  const [guests, setGuests] =
    useState<AllottedGuest[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [processingId, setProcessingId] =
    useState<string | null>(null);

  const [search, setSearch] =
    useState("");

  const [error, setError] =
    useState("");

  const [selectedGuest, setSelectedGuest] =
    useState<AllottedGuest | null>(
      null
    );

  const [resultModal, setResultModal] =
    useState<{
      type: AppModalType;
      title: string;
      message: string;
    } | null>(null);

  const [manualCheckInGuest, setManualCheckInGuest] =
    useState<AllottedGuest | null>(null);

  const [manualCheckInDate, setManualCheckInDate] =
    useState(
      new Date().toISOString().slice(0, 10)
    );

  const [manualCheckInTime, setManualCheckInTime] =
    useState("13:00");

  const [manualAmount, setManualAmount] =
    useState("");

  const [manualRemarks, setManualRemarks] =
    useState("");

  const [manualCheckInLoading, setManualCheckInLoading] =
    useState(false);

  const canPreCheckIn =
    userRole === "ADMIN" || userRole === "RECEPTIONIST";

  /* =========================================
     LOAD ELIGIBLE GUESTS
  ========================================= */

  const loadGuests = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await apiFetch(
        "http://localhost:5000/api/check-ins/eligible",
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
        }
      );

      const data =
        await response.json();

      console.log(
        "CHECK-IN API RESPONSE:",
        data
      );

      if (!response.ok) {
        setGuests([]);

        setError(
          data?.message ||
            tr(
              "Unable to load guests for check-in.",
              "चेक-इनसाठी अतिथी लोड करता आले नाहीत."
            )
        );

        return;
      }

      /* =====================================
         NORMALIZE API RESPONSE
      ===================================== */

      const apiGuests =
        Array.isArray(data?.guests)
          ? data.guests
          : [];

      const normalizedGuests: AllottedGuest[] =
        apiGuests.map(
          (guest: Record<string, unknown>) => ({
            allotment_id:
              String(
                guest.allotment_id ?? ""
              ),

            booking_id:
              String(
                guest.booking_id ?? ""
              ),

            booking_reference:
              String(
                guest.booking_reference ?? ""
              ),

            booking_person_name:
              guest.booking_person_name
                ? String(guest.booking_person_name)
                : null,

            guest_id:
              String(
                guest.guest_id ?? ""
              ),

            guest_name:
              String(
                guest.guest_name ?? ""
              ),

            mobile_number:
              guest.mobile_number
                ? String(
                    guest.mobile_number
                  )
                : null,

            room_id:
              String(
                guest.room_id ?? ""
              ),

            room_number:
              String(
                guest.room_number ?? ""
              ),

            bed_id:
              guest.bed_id
                ? String(
                    guest.bed_id
                  )
                : null,

            bed_number:
              guest.bed_number ===
                null ||
              guest.bed_number ===
                undefined ||
              guest.bed_number ===
                ""
                ? null
                : Number(
                    guest.bed_number
                  ),

            check_in_date:
              String(
                guest.check_in_date ?? ""
              ),

            expected_check_out_date:
              String(
                guest.expected_check_out_date ??
                  ""
              ),

            check_in_available:
              guest.check_in_available === true,

            approval_status:
              String(
                guest.approval_status ??
                  ""
              ).toUpperCase(),

            allotment_status:
              String(
                guest.allotment_status ??
                  ""
              ).toUpperCase(),

            check_in_status:
              String(
                guest.check_in_status ??
                  "NOT_CHECKED_IN"
              ).toUpperCase() ===
              "CHECKED_IN"
                ? "CHECKED_IN"
                : "NOT_CHECKED_IN",
          })
        );

      console.log(
        "NORMALIZED CHECK-IN GUESTS:",
        normalizedGuests
      );

      setGuests(
        normalizedGuests
      );
    } catch (error) {
      console.error(
        "Check-in eligible guests error:",
        error
      );

      setGuests([]);

      setError(
        tr(
          "Unable to connect to the check-in server. Please make sure the backend is running.",
          "चेक-इन सर्व्हरशी कनेक्ट करता आले नाही. कृपया बॅकएंड सुरू आहे याची खात्री करा."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  /* =========================================
     INITIAL LOAD
  ========================================= */

  useEffect(() => {
    // This effect starts the initial async API load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadGuests();
  }, []);

  /* =========================================
     OPEN CONFIRMATION
  ========================================= */

  const openCheckInConfirmation = (
    guest: AllottedGuest
  ) => {
    if (!guest.check_in_available) {
      return;
    }

    setError("");
    setSelectedGuest(guest);
  };

  /* =========================================
     CLOSE CONFIRMATION
  ========================================= */

  const closeCheckInConfirmation = () => {
    if (processingId) {
      return;
    }

    setSelectedGuest(null);
  };

  /* =========================================
     PERFORM CHECK-IN
  ========================================= */

  const confirmCheckIn = async () => {
    if (!selectedGuest) {
      return;
    }

    const guest =
      selectedGuest;
    const guestNames = guest.room_group_guests?.map(
      (roomGuest) => roomGuest.guest_name
    );

    setProcessingId(
      guest.allotment_id
    );

    setError("");

    try {
      const isRoomGroup = Boolean(guest.room_group_guests?.length);
      const response = await apiFetch(
        isRoomGroup
          ? "http://localhost:5000/api/check-ins/room"
          : "http://localhost:5000/api/check-ins",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "application/json",
          },

          body: JSON.stringify(isRoomGroup ? {
            booking_id: guest.booking_id,
            room_id: guest.room_id,
            checked_in_by: userId,
          } : {
            allotment_id:
              guest.allotment_id,

            booking_id:
              guest.booking_id,

            guest_id:
              guest.guest_id,

            room_id:
              guest.room_id,

            bed_id:
              guest.bed_id,

            checked_in_by:
              userId,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setSelectedGuest(null);

        setResultModal({
          type: "error",

          title: tr(
            "Check-In Failed",
            "चेक-इन अयशस्वी"
          ),

          message:
            data?.message ||
            tr(
              "Unable to complete check-in.",
              "चेक-इन पूर्ण करता आले नाही."
            ),
        });

        return;
      }

      setSelectedGuest(null);

      setResultModal({
        type: "success",

        title: tr(
          "Check-In Completed",
          "चेक-इन पूर्ण झाले"
        ),

        message: isRoomGroup
          ? tr(
              `Room ${guest.room_number} check-in completed for ${guestNames?.length ?? 0} guest(s): ${guestNames?.join(", ")}.`,
              `खोली ${guest.room_number} मधील ${guestNames?.length ?? 0} अतिथींचा चेक-इन पूर्ण झाला: ${guestNames?.join(", ")}.`
            )
          : guest.bed_number !== null
            ? tr(
                `Check-in completed successfully for ${guest.guest_name}.

Room: ${guest.room_number}
Bed: ${guest.bed_number}`,
                `${guest.guest_name} यांचा चेक-इन यशस्वी झाला.

खोली: ${guest.room_number}
बेड: ${guest.bed_number}`
              )
            : tr(
                `Check-in completed successfully for ${guest.guest_name}.

Room: ${guest.room_number}
Accommodation: Full Room`,
                `${guest.guest_name} यांचा चेक-इन यशस्वी झाला.

खोली: ${guest.room_number}
निवास: पूर्ण खोली`
              ),
      });

      await loadGuests();
    } catch (error) {
      console.error(
        "Check-in error:",
        error
      );

      setSelectedGuest(null);

      setResultModal({
        type: "error",

        title: tr(
          "Check-In Server Unavailable",
          "चेक-इन सर्व्हर उपलब्ध नाही"
        ),

        message: tr(
          "Unable to connect to the check-in server. Please make sure the backend is running.",
          "चेक-इन सर्व्हरशी कनेक्ट करता आले नाही. कृपया बॅकएंड सुरू आहे याची खात्री करा."
        ),
      });
    } finally {
      setProcessingId(null);
    }
  };

  const submitManualCheckIn = async () => {
    if (!manualCheckInGuest) {
      return;
    }

    if (!manualCheckInDate) {
      setResultModal({
        type: "error",
        title: tr(
          "Check-In Date Required",
          "चेक-इन तारीख आवश्यक आहे"
        ),
        message: tr(
          "Please enter the guest's actual check-in date.",
          "कृपया अतिथीची वास्तविक चेक-इन तारीख भरा."
        ),
      });
      return;
    }

    setManualCheckInLoading(true);

    try {
      const isRoomGroup = Boolean(manualCheckInGuest.room_group_guests?.length);
      const response = await apiFetch(
        isRoomGroup
          ? "http://localhost:5000/api/check-ins/manual-room"
          : "http://localhost:5000/api/check-ins/manual",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(isRoomGroup ? {
            booking_id: manualCheckInGuest.booking_id,
            room_id: manualCheckInGuest.room_id,
            checked_in_by: userId,
            actual_check_in_date: manualCheckInDate,
            actual_check_in_time: manualCheckInTime,
            amount: manualAmount.trim() ? Number(manualAmount) : null,
            payment_method: "CASH",
            remarks: manualRemarks.trim() || "Manual pre-checkin entry created by authorized staff.",
          } : {
            allotment_id: manualCheckInGuest.allotment_id,
            booking_id: manualCheckInGuest.booking_id,
            guest_id: manualCheckInGuest.guest_id,
            room_id: manualCheckInGuest.room_id,
            bed_id: manualCheckInGuest.bed_id,
            checked_in_by: userId,
            actual_check_in_date: manualCheckInDate,
            actual_check_in_time: manualCheckInTime,
            amount: manualAmount.trim() ? Number(manualAmount) : null,
            payment_method: "CASH",
            remarks: manualRemarks.trim() || "Manual pre-checkin entry created by authorized staff.",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setResultModal({
          type: "error",
          title: tr(
            "Pre-Checkin Failed",
            "प्री-चेक-इन अयशस्वी"
          ),
          message:
            data?.message ||
            tr(
              "Unable to record the manual check-in.",
              "मॅन्युअल चेक-इन नोंदवता आले नाही."
            ),
        });
        return;
      }

      setManualCheckInGuest(null);
      setManualCheckInDate(new Date().toISOString().slice(0, 10));
      setManualCheckInTime("13:00");
      setManualAmount("");
      setManualRemarks("");

      setResultModal({
        type: "success",
        title: tr(
          "Pre-Checkin Recorded",
          "प्री-चेक-इन नोंदवले"
        ),
        message: tr(
          "The guest's check-in has been recorded on the selected actual arrival date, so daily accounting will reflect the correct date.",
          "अतिथीचे चेक-इन निवडलेली वास्तविक आगमन तारीखावर नोंदवले गेले आहे, त्यामुळे दररोजची हिशोब पद्धत योग्य तारीखवर दिसेल."
        ),
      });

      await loadGuests();
    } catch (error) {
      console.error("Manual pre-checkin error:", error);
      setResultModal({
        type: "error",
        title: tr(
          "Pre-Checkin Server Error",
          "प्री-चेक-इन सर्व्हर त्रुटी"
        ),
        message: tr(
          "Unable to connect to the check-in service. Please try again.",
          "चेक-इन सेवेशी कनेक्ट करता आले नाही. कृपया पुन्हा प्रयत्न करा."
        ),
      });
    } finally {
      setManualCheckInLoading(false);
    }
  };

  /* =========================================
     SEARCH
  ========================================= */

  const searchValue =
    search
      .trim()
      .toLowerCase();

  const groupedRoomGuests = new Map<string, AllottedGuest>();
  const checkInEntries = guests.reduce<AllottedGuest[]>((entries, guest) => {
    if (guest.bed_id !== null) {
      entries.push(guest);
      return entries;
    }
    const groupKey = `${guest.booking_id}:${guest.room_id}`;
    const existingGroup = groupedRoomGuests.get(groupKey);
    if (existingGroup) {
      existingGroup.room_group_guests?.push(guest);
    } else {
      const group = { ...guest, room_group_guests: [guest] };
      groupedRoomGuests.set(groupKey, group);
      entries.push(group);
    }
    return entries;
  }, []);

  const filteredGuests =
    checkInEntries.filter(
      (guest) => {
        if (!searchValue) {
          return true;
        }

        return (
          (guest.room_group_guests?.some((roomGuest) =>
            roomGuest.guest_name.toLowerCase().includes(searchValue)
          ) ?? guest.guest_name.toLowerCase().includes(searchValue)) ||
          (guest.booking_person_name || "")
            .toLowerCase()
            .includes(searchValue) ||
          guest.guest_name
            .toLowerCase()
            .includes(searchValue) ||

          guest.booking_reference
            .toLowerCase()
            .includes(searchValue) ||

          guest.room_number
            .toLowerCase()
            .includes(searchValue) ||

          String(
            guest.bed_number ?? ""
          ).includes(
            searchValue
          ) ||

          (
            guest.mobile_number ||
            ""
          )
            .toLowerCase()
            .includes(searchValue)
        );
      }
    );

  /* =========================================
     COUNTS
  ========================================= */

  const readyCount =
    guests.filter(
      (guest) =>
        guest.check_in_status ===
        "NOT_CHECKED_IN" &&
        guest.check_in_available
    ).length;

  const checkedInCount =
    guests.filter(
      (guest) =>
        guest.check_in_status ===
        "CHECKED_IN"
    ).length;

  return (
    <div className="checkin-page">

      <style>{`
        * {
          box-sizing: border-box;
        }

        .checkin-page {
          min-height: 100vh;
          background:
            linear-gradient(
              135deg,
              #eef3f8 0%,
              #f8fafc 45%,
              #e9eef4 100%
            );
          padding: 28px;
          color: #1e293b;
          font-family:
            Inter,
            "Segoe UI",
            Arial,
            sans-serif;
        }

        .checkin-container {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
        }

        .checkin-header {
          background: #ffffff;
          border: 1px solid #dbe3ec;
          border-radius: 18px;
          padding: 24px 28px;
          box-shadow:
            0 8px 24px
            rgba(15, 23, 42, 0.07);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 20px;
        }

        .checkin-title-area {
          display: flex;
          align-items: center;
          gap: 18px;
        }

        .checkin-emblem {
          width: 58px;
          height: 58px;
          border-radius: 0;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: none;
        }

        .checkin-title-area h1 {
          margin: 0 0 5px;
          font-size: 28px;
          font-weight: 750;
          color: #102a43;
        }

        .checkin-title-area p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
        }

        .checkin-header-right {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .language-switcher {
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid #dbe3ec;
          border-radius: 9px;
          padding: 4px 7px;
          background: #f8fafc;
        }

        .language-button {
          border: none;
          background: transparent;
          color: #64748b;
          padding: 6px 9px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .language-button.active {
          background: #163a63;
          color: #ffffff;
        }

        .language-divider {
          color: #cbd5e1;
        }

        .checkin-back-button {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          padding: 11px 18px;
          border-radius: 9px;
          font-size: 14px;
          font-weight: 650;
          cursor: pointer;
        }

        .checkin-back-button:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .checkin-summary {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 20px;
        }

        .summary-card {
          background: #ffffff;
          border: 1px solid #dbe3ec;
          border-radius: 14px;
          padding: 18px 20px;
          box-shadow:
            0 5px 18px
            rgba(15, 23, 42, 0.05);
        }

        .summary-label {
          color: #64748b;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .summary-number {
          color: #102a43;
          font-size: 27px;
          font-weight: 750;
        }

        .checkin-toolbar {
          background: #ffffff;
          border: 1px solid #dbe3ec;
          border-radius: 14px;
          padding: 16px 18px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow:
            0 5px 18px
            rgba(15, 23, 42, 0.05);
          margin-bottom: 18px;
        }

        .checkin-user {
          min-width: 230px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .checkin-user strong {
          color: #163a63;
          font-size: 14px;
        }

        .checkin-user span {
          color: #64748b;
          font-size: 12px;
        }

        .checkin-search {
          flex: 1;
          min-width: 220px;
          height: 42px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          padding: 0 14px;
          font-size: 14px;
          outline: none;
          background: #f8fafc;
        }

        .checkin-search:focus {
          border-color: #3b82f6;
          background: #ffffff;
        }

        .checkin-refresh {
          height: 42px;
          padding: 0 17px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: #ffffff;
          color: #334155;
          font-weight: 650;
          cursor: pointer;
        }

        .checkin-refresh:hover {
          background: #f1f5f9;
        }

        .checkin-refresh:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .precheckin-button {
          height: 42px;
          padding: 0 17px;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          background: linear-gradient(135deg, #0f766e, #115e59);
          color: #ffffff;
          font-weight: 700;
          cursor: pointer;
        }

        .precheckin-button:hover {
          background: linear-gradient(135deg, #115e59, #0f766e);
        }

        .checkin-error {
          background: #fff1f2;
          border: 1px solid #fecdd3;
          color: #be123c;
          border-radius: 10px;
          padding: 13px 16px;
          margin-bottom: 18px;
          font-size: 14px;
        }

        .checkin-table-card {
          background: #ffffff;
          border: 1px solid #dbe3ec;
          border-radius: 16px;
          overflow: hidden;
          box-shadow:
            0 8px 24px
            rgba(15, 23, 42, 0.06);
        }

        .checkin-table-header {
          padding: 18px 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .checkin-table-header h2 {
          margin: 0;
          color: #163a63;
          font-size: 17px;
        }

        .checkin-table-header span {
          color: #64748b;
          font-size: 13px;
        }

        .checkin-table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .checkin-table {
          width: 100%;
          min-width: 1050px;
          border-collapse: collapse;
        }

        .checkin-table th {
          background: #f8fafc;
          color: #475569;
          text-align: left;
          padding: 13px 15px;
          font-size: 12px;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
        }

        .checkin-table td {
          padding: 15px;
          border-bottom: 1px solid #edf2f7;
          font-size: 13px;
          color: #334155;
          white-space: nowrap;
        }

        .checkin-table tbody tr:hover {
          background: #f8fbff;
        }

        .booking-reference {
          color: #163a63;
          font-weight: 750;
        }

        .guest-name {
          color: #172b4d;
          font-weight: 700;
        }

        .room-number {
          color: #163a63;
          font-weight: 750;
        }

        .bed-number,
        .room-only {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          border-radius: 7px;
          background: #eef4fa;
          color: #24527e;
          font-weight: 700;
          font-size: 12px;
        }

        .status-ready {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: #fff7ed;
          color: #c2410c;
          font-size: 11px;
          font-weight: 750;
        }

        .status-ready::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f97316;
        }

        .status-scheduled {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 11px;
          font-weight: 750;
        }

        .status-checked {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          background: #ecfdf5;
          color: #047857;
          font-size: 11px;
          font-weight: 750;
        }

        .status-checked::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .checkin-action {
          border: none;
          border-radius: 8px;
          padding: 9px 14px;
          background:
            linear-gradient(
              135deg,
              #163a63,
              #24527e
            );
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .checkin-action:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .completed-text {
          color: #047857;
          font-size: 12px;
          font-weight: 700;
        }

        .empty-state {
          background: #ffffff;
          border: 1px solid #dbe3ec;
          border-radius: 16px;
          padding: 60px 25px;
          text-align: center;
          box-shadow:
            0 8px 24px
            rgba(15, 23, 42, 0.05);
        }

        .empty-icon {
          width: 58px;
          height: 58px;
          margin: 0 auto 15px;
          border-radius: 50%;
          background: #eef4fa;
          color: #24527e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 800;
        }

        .empty-state h2 {
          margin: 0 0 8px;
          color: #163a63;
          font-size: 19px;
        }

        .empty-state p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
        }

        /* =====================================
           MODAL
        ===================================== */

        .checkin-modal-overlay {
          position: fixed;
          inset: 0;
          background:
            rgba(15, 23, 42, 0.58);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          z-index: 9999;
          backdrop-filter: blur(3px);
        }

        .checkin-modal {
          width: 100%;
          max-width: 520px;
          background: #ffffff;
          border-radius: 18px;
          overflow: hidden;
          box-shadow:
            0 25px 70px
            rgba(15, 23, 42, 0.28);
        }

        .checkin-modal-header {
          padding: 20px 22px;
          background:
            linear-gradient(
              135deg,
              #163a63,
              #285b8f
            );
          color: #ffffff;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .checkin-modal-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .checkin-modal-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background:
            rgba(255,255,255,0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
        }

        .checkin-modal-header h2 {
          margin: 0;
          font-size: 18px;
        }

        .checkin-modal-close {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 8px;
          background:
            rgba(255,255,255,0.12);
          color: #ffffff;
          font-size: 20px;
          cursor: pointer;
        }

        .checkin-modal-body {
          padding: 24px;
        }

        .checkin-modal-intro {
          margin: 0 0 18px;
          color: #64748b;
          font-size: 14px;
          line-height: 1.5;
        }

        .checkin-details {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .checkin-detail {
          padding: 13px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
        }

        .checkin-detail-label {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 650;
          margin-bottom: 5px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .checkin-detail-value {
          display: block;
          color: #172b4d;
          font-size: 14px;
          font-weight: 700;
        }

        .checkin-confirm-note {
          margin-top: 18px;
          padding: 12px 14px;
          border-radius: 9px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1e40af;
          font-size: 12px;
          line-height: 1.5;
        }

        .checkin-modal-footer {
          padding: 16px 24px 22px;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }

        .modal-cancel-button {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #334155;
          border-radius: 9px;
          padding: 10px 17px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .modal-confirm-button {
          border: none;
          background:
            linear-gradient(
              135deg,
              #163a63,
              #24527e
            );
          color: #ffffff;
          border-radius: 9px;
          padding: 10px 19px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .modal-confirm-button:disabled,
        .modal-cancel-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .checkin-page {
            padding: 16px;
          }

          .checkin-summary {
            grid-template-columns: 1fr;
          }

          .checkin-toolbar {
            flex-direction: column;
            align-items: stretch;
          }

          .checkin-user {
            min-width: 0;
          }

          .checkin-header {
            align-items: flex-start;
          }

          .checkin-header-right {
            flex-direction: column;
            align-items: stretch;
          }
        }

        @media (max-width: 600px) {
          .checkin-header {
            flex-direction: column;
            align-items: stretch;
          }

          .checkin-header-right {
            width: 100%;
          }

          .checkin-back-button {
            width: 100%;
          }

          .checkin-title-area h1 {
            font-size: 23px;
          }

          .checkin-details {
            grid-template-columns: 1fr;
          }

          .checkin-modal-footer {
            flex-direction: column-reverse;
          }

          .modal-cancel-button,
          .modal-confirm-button {
            width: 100%;
          }
        }
      `}</style>

      <div className="checkin-container">

        {/* =====================================
            HEADER
        ===================================== */}

        <header className="checkin-header">

          <div className="checkin-title-area">

            <BrandLogo className="checkin-emblem" />

            <div>
              <h1>
                {tr(
                  "Guest Check-In",
                  "अतिथी चेक-इन"
                )}
              </h1>

              <p>
                {tr(
                  "ESM Rest House • Pune",
                  "ESM विश्रामगृह • पुणे"
                )}
              </p>
            </div>

          </div>

          <div className="checkin-header-right">

            <div className="language-switcher">

              <button
                type="button"
                className={`language-button ${
                  language === "en"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setLanguage("en")
                }
              >
                EN
              </button>

              <span className="language-divider">
                |
              </span>

              <button
                type="button"
                className={`language-button ${
                  language === "mr"
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  setLanguage("mr")
                }
              >
                मराठी
              </button>

            </div>

            <button
              type="button"
              className="checkin-back-button"
              onClick={onBack}
            >
              ←{" "}
              {tr(
                "Back to Dashboard",
                "डॅशबोर्डवर परत जा"
              )}
            </button>

          </div>

        </header>

        {/* =====================================
            SUMMARY
        ===================================== */}

        <section className="checkin-summary">

          <div className="summary-card">

            <div className="summary-label">
              {tr(
                "Total Allotted Guests",
                "एकूण अलॉट केलेले अतिथी"
              )}
            </div>

            <div className="summary-number">
              {guests.length}
            </div>

          </div>

          <div className="summary-card">

            <div className="summary-label">
              {tr(
                "Ready for Check-In",
                "चेक-इनसाठी तयार"
              )}
            </div>

            <div className="summary-number">
              {readyCount}
            </div>

          </div>

          <div className="summary-card">

            <div className="summary-label">
              {tr(
                "Checked In",
                "चेक-इन झालेले"
              )}
            </div>

            <div className="summary-number">
              {checkedInCount}
            </div>

          </div>

        </section>

        {/* =====================================
            TOOLBAR
        ===================================== */}

        <section className="checkin-toolbar">

          <div className="checkin-user">

            <strong>
              {tr(
                "Reception Desk",
                "रिसेप्शन डेस्क"
              )}
            </strong>

            <span>
              {tr(
                "Logged in as",
                "लॉग-इन वापरकर्ता"
              )}{" "}
              {userName}
            </span>

          </div>

          <input
            type="text"
            className="checkin-search"
            placeholder={tr(
              "Search guest, booking, room, bed or mobile...",
              "अतिथी, बुकिंग, खोली, बेड किंवा मोबाईल शोधा..."
            )}
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />

          <button
            type="button"
            className="checkin-refresh"
            onClick={loadGuests}
            disabled={loading}
          >
            {loading
              ? tr(
                  "Refreshing...",
                  "रिफ्रेश होत आहे..."
                )
              : `↻ ${tr(
                  "Refresh",
                  "रिफ्रेश"
                )}`}
          </button>

          {canPreCheckIn && (
            <button
              type="button"
              className="precheckin-button"
              disabled={loading || manualCheckInLoading}
              onClick={() => {
                const guestToPreCheckIn = filteredGuests[0] ?? guests[0];
                if (!guestToPreCheckIn) {
                  setResultModal({
                    type: "info",
                    title: tr(
                      "No Guest Available for Pre-Checkin",
                      "प्री-चेक-इनसाठी अतिथी उपलब्ध नाही"
                    ),
                    message: tr(
                      "There are no eligible guests to pre-check in. The booking must be approved and accepted, have an active room allotment, and have a successful payment with an invoice. Complete those steps, then refresh this page.",
                      "प्री-चेक-इनसाठी पात्र अतिथी नाहीत. बुकिंग मंजूर व स्वीकारलेले असणे, सक्रिय खोलीचे अलॉटमेंट आणि यशस्वी पेमेंटसह इनव्हॉइस असणे आवश्यक आहे. ही प्रक्रिया पूर्ण करून हे पेज रिफ्रेश करा."
                    ),
                  });
                  return;
                }

                setManualCheckInGuest(guestToPreCheckIn);
                setManualCheckInDate(new Date().toISOString().slice(0, 10));
                setManualCheckInTime("13:00");
                setManualAmount("");
                setManualRemarks("");
              }}
            >
              {tr("Pre-Checkin", "प्री-चेक-इन")}
            </button>
          )}

        </section>

        {/* =====================================
            ERROR
        ===================================== */}

        {error && (
          <div className="checkin-error">
            {error}
          </div>
        )}

        {/* =====================================
            CONTENT
        ===================================== */}

        {loading ? (

          <div className="empty-state">

            <div className="empty-icon">
              …
            </div>

            <h2>
              {tr(
                "Loading Check-In List",
                "चेक-इन यादी लोड होत आहे"
              )}
            </h2>

            <p>
              {tr(
                "Please wait while the system loads allotted guests.",
                "सिस्टम अलॉट केलेले अतिथी लोड करत आहे. कृपया प्रतीक्षा करा."
              )}
            </p>

          </div>

        ) : filteredGuests.length === 0 ? (

          <div className="empty-state">

            <div className="empty-icon">
              ✓
            </div>

            <h2>
              {tr(
                "No Guests Found",
                "अतिथी सापडले नाहीत"
              )}
            </h2>

            <p>
              {guests.length === 0
                ? tr(
                    "No approved and allotted guests are currently available for check-in.",
                    "सध्या चेक-इनसाठी कोणतेही मंजूर आणि अलॉट केलेले अतिथी उपलब्ध नाहीत."
                  )
                : tr(
                    "No guests match your current search.",
                    "आपल्या सध्याच्या शोधाशी कोणतेही अतिथी जुळत नाहीत."
                  )}
            </p>

          </div>

        ) : (

          <section className="checkin-table-card">

            <div className="checkin-table-header">

              <h2>
                {tr(
                  "Allotted Guests",
                  "अलॉट केलेले अतिथी"
                )}
              </h2>

              <span>
                {tr(
                  "Showing",
                  "दाखवत आहे"
                )}{" "}
                {filteredGuests.length}{" "}
                {tr(
                  "guest(s)",
                  "अतिथी"
                )}
              </span>

            </div>

            <div className="checkin-table-wrapper">

              <table className="checkin-table">

                <thead>
                  <tr>

                    <th>
                      {tr(
                        "Booking",
                        "बुकिंग"
                      )}
                    </th>

                    <th>
                      {tr("Guest", "अतिथी")}
                    </th>

                    <th>
                      {tr(
                        "Mobile",
                        "मोबाईल"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Room",
                        "खोली"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Bed / Accommodation",
                        "बेड / निवास"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Check-In Date",
                        "चेक-इन तारीख"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Expected Check-Out",
                        "अपेक्षित चेक-आउट"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Status",
                        "स्थिती"
                      )}
                    </th>

                    <th>
                      {tr(
                        "Action",
                        "कृती"
                      )}
                    </th>

                  </tr>
                </thead>

                <tbody>

                  {filteredGuests.map(
                    (guest) => (

                      <tr
                        key={
                          guest.allotment_id
                        }
                      >

                        <td>
                          <span className="booking-reference">
                            {
                              guest.booking_reference
                            }
                          </span>
                        </td>

                        <td>
                          <span className="guest-name">
                            {guest.room_group_guests
                              ? guest.booking_person_name || guest.guest_name
                              : guest.guest_name}
                          </span>
                          {guest.room_group_guests && (
                            <small style={{ display: "block", marginTop: 4 }}>
                              {guest.room_group_guests.map((roomGuest) => roomGuest.guest_name).join(", ")}
                            </small>
                          )}
                        </td>

                        <td>
                          {
                            guest.mobile_number ||
                            "—"
                          }
                        </td>

                        <td>
                          <span className="room-number">
                            {
                              guest.room_number
                            }
                          </span>
                        </td>

                        <td>

                          {guest.bed_number !== null ? (

                            <span className="bed-number">
                              {tr(
                                "Bed",
                                "बेड"
                              )}{" "}
                              {
                                guest.bed_number
                              }
                            </span>

                          ) : (

                            <span className="room-only">
                              {tr(
                                "Room Only",
                                "पूर्ण खोली"
                              )}
                            </span>

                          )}

                        </td>

                        <td>
                          {formatDate(
                            guest.check_in_date,
                            isMarathi
                          )}
                        </td>

                        <td>
                          {formatDate(
                            guest.expected_check_out_date,
                            isMarathi
                          )}
                        </td>

                        <td>

                          {guest.check_in_status ===
                          "CHECKED_IN" ? (

                            <span className="status-checked">
                              {tr(
                                "CHECKED IN",
                                "चेक-इन झाले"
                              )}
                            </span>

                          ) : (

                            <span className={guest.check_in_available ? "status-ready" : "status-scheduled"}>
                              {tr(
                                guest.check_in_available ? "READY" : "SCHEDULED",
                                guest.check_in_available ? "तयार" : "तारीख बाकी"
                              )}
                            </span>

                          )}

                        </td>

                        <td>

                          {guest.check_in_status ===
                          "CHECKED_IN" ? (

                            <span className="completed-text">
                              ✓{" "}
                              {tr(
                                "Completed",
                                "पूर्ण"
                              )}
                            </span>

                          ) : (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                type="button"
                                className="checkin-action"
                                disabled={
                                  !guest.check_in_available ||
                                  processingId ===
                                  guest.allotment_id
                                }
                                onClick={() =>
                                  openCheckInConfirmation(
                                    guest
                                  )
                                }
                              >
                                {tr(
                                  guest.room_group_guests
                                    ? `${guest.check_in_available ? "Check-In Room" : "Room Check-In Scheduled"} (${guest.room_group_guests.length})`
                                    : guest.check_in_available ? "Check-In" : "Check-In Scheduled",
                                  guest.room_group_guests
                                    ? `${guest.check_in_available ? "खोली चेक-इन" : "खोली चेक-इनची तारीख बाकी"} (${guest.room_group_guests.length})`
                                    : guest.check_in_available ? "चेक-इन" : "चेक-इनची तारीख बाकी"
                                )}
                              </button>

                              {canPreCheckIn && (
                                <button
                                  type="button"
                                  className="precheckin-button"
                                  style={{ height: 34, padding: "0 12px" }}
                                  onClick={() => setManualCheckInGuest(guest)}
                                >
                                  {guest.room_group_guests
                                    ? tr("Pre-Checkin Room", "खोलीचे प्री-चेक-इन")
                                    : tr("Pre-Checkin", "प्री-चेक-इन")}
                                </button>
                              )}
                            </div>

                          )}

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          </section>

        )}

      </div>

      {/* =====================================
          CHECK-IN CONFIRMATION MODAL
      ===================================== */}

      {selectedGuest && (

        <div
          className="checkin-modal-overlay"
          onMouseDown={(event) => {

            if (
              event.target ===
              event.currentTarget
            ) {
              closeCheckInConfirmation();
            }

          }}
        >

          <section
            className="checkin-modal"
            role="dialog"
            aria-modal="true"
          >

            <header className="checkin-modal-header">

              <div className="checkin-modal-title">

                <div className="checkin-modal-icon">
                  ✓
                </div>

                <h2>
                  {tr(
                    selectedGuest.room_group_guests ? "Confirm Room Check-In" : "Confirm Guest Check-In",
                    selectedGuest.room_group_guests ? "खोली चेक-इनची पुष्टी करा" : "अतिथी चेक-इनची पुष्टी करा"
                  )}
                </h2>

              </div>

              <button
                type="button"
                className="checkin-modal-close"
                onClick={
                  closeCheckInConfirmation
                }
                disabled={
                  Boolean(processingId)
                }
              >
                ×
              </button>

            </header>

            <div className="checkin-modal-body">

              <p className="checkin-modal-intro">
                {tr(
                  "Please verify the following accommodation details before completing the guest check-in.",
                  "अतिथीचे चेक-इन पूर्ण करण्यापूर्वी खालील निवास तपशील तपासा."
                )}
              </p>

              <div className="checkin-details">

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Guest",
                      "अतिथी"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                  {selectedGuest.room_group_guests
                    ? selectedGuest.room_group_guests.map((guest) => guest.guest_name).join(", ")
                    : selectedGuest.guest_name}
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Booking",
                      "बुकिंग"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {
                      selectedGuest.booking_reference
                    }
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Mobile",
                      "मोबाईल"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {
                      selectedGuest.mobile_number ||
                      "—"
                    }
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Room",
                      "खोली"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {
                      selectedGuest.room_number
                    }
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Bed / Accommodation",
                      "बेड / निवास"
                    )}
                  </span>

                  <span className="checkin-detail-value">

                    {selectedGuest.bed_number !==
                    null
                      ? `${tr(
                          "Bed",
                          "बेड"
                        )} ${
                          selectedGuest.bed_number
                        }`
                      : tr(
                          "Full Room",
                          "पूर्ण खोली"
                        )}

                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Check-In Date",
                      "चेक-इन तारीख"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {formatDate(
                      selectedGuest.check_in_date,
                      isMarathi
                    )}
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Expected Check-Out",
                      "अपेक्षित चेक-आउट"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {formatDate(
                      selectedGuest.expected_check_out_date,
                      isMarathi
                    )}
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">
                    {tr(
                      "Current Status",
                      "सध्याची स्थिती"
                    )}
                  </span>

                  <span className="checkin-detail-value">
                    {tr(
                      "READY",
                      "तयार"
                    )}
                  </span>
                </div>

              </div>

              <div className="checkin-confirm-note">
                {tr(
                  "Confirming this action will record the current date and time as the guest's check-in time and record the logged-in user as the person who completed the check-in.",
                  "या कृतीची पुष्टी केल्यावर सध्याची तारीख व वेळ अतिथीची चेक-इन वेळ म्हणून नोंदवली जाईल आणि लॉग-इन केलेला वापरकर्ता चेक-इन पूर्ण करणारी व्यक्ती म्हणून नोंदवला जाईल."
                )}
              </div>

            </div>

            <footer className="checkin-modal-footer">

              <button
                type="button"
                className="modal-cancel-button"
                onClick={
                  closeCheckInConfirmation
                }
                disabled={
                  Boolean(processingId)
                }
              >
                {tr(
                  "Cancel",
                  "रद्द करा"
                )}
              </button>

              <button
                type="button"
                className="modal-confirm-button"
                onClick={
                  confirmCheckIn
                }
                disabled={
                  processingId ===
                  selectedGuest.allotment_id
                }
              >
                {processingId ===
                selectedGuest.allotment_id
                  ? tr(
                      "Checking In...",
                      "चेक-इन होत आहे..."
                    )
                  : tr(
                      "Confirm Check-In",
                      "चेक-इनची पुष्टी करा"
                    )}
              </button>

            </footer>

          </section>

        </div>

      )}

      {/* =====================================
          RESULT MODAL
      ===================================== */}

      {manualCheckInGuest && (
        <div
          className="checkin-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setManualCheckInGuest(null);
            }
          }}
        >
          <section
            className="checkin-modal"
            role="dialog"
            aria-modal="true"
          >
            <header className="checkin-modal-header">
              <div className="checkin-modal-title">
                <div className="checkin-modal-icon">⏱</div>
                <h2>
                  {tr("Manual Pre-Checkin", "मॅन्युअल प्री-चेक-इन")}
                </h2>
              </div>
              <button
                type="button"
                className="checkin-modal-close"
                onClick={() => setManualCheckInGuest(null)}
                disabled={manualCheckInLoading}
              >
                ×
              </button>
            </header>

            <div className="checkin-modal-body">
              <p className="checkin-modal-intro">
                {tr(
                  "Use this option when a guest has already arrived but the check-in entry was missed. The selected arrival date will be used for accounting and reporting.",
                  "जेव्हा अतिथी आधीच पोहोचला असतो पण चेक-इन नोंद चुकली असेल, तेव्हा हे पर्याय वापरा. निवडलेली आगमन तारीख हिशोब आणि रिपोर्टिंगसाठी वापरली जाईल."
                )}
              </p>

              <div className="checkin-details">
                <div className="checkin-detail">
                  <span className="checkin-detail-label">{tr("Guest", "अतिथी")}</span>
                  <span className="checkin-detail-value">
                    {manualCheckInGuest.room_group_guests
                      ? manualCheckInGuest.room_group_guests.map((guest) => guest.guest_name).join(", ")
                      : manualCheckInGuest.guest_name}
                  </span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">{tr("Booking", "बुकिंग")}</span>
                  <span className="checkin-detail-value">{manualCheckInGuest.booking_reference}</span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">{tr("Room", "खोली")}</span>
                  <span className="checkin-detail-value">{manualCheckInGuest.room_number}</span>
                </div>

                <div className="checkin-detail">
                  <span className="checkin-detail-label">{tr("Bed / Accommodation", "बेड / निवास")}</span>
                  <span className="checkin-detail-value">
                    {manualCheckInGuest.bed_number !== null ? `Bed ${manualCheckInGuest.bed_number}` : tr("Full Room", "पूर्ण खोली")}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("Actual Check-In Date", "वास्तविक चेक-इन तारीख")}</span>
                  <input
                    type="date"
                    value={manualCheckInDate}
                    onChange={(event) => setManualCheckInDate(event.target.value)}
                    style={{
                      height: 38,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "0 10px",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("Actual Check-In Time", "वास्तविक चेक-इन वेळ")}</span>
                  <input
                    type="time"
                    value={manualCheckInTime}
                    onChange={(event) => setManualCheckInTime(event.target.value)}
                    style={{
                      height: 38,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "0 10px",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("Amount (Optional)", "रक्कम (पर्यायी)")}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualAmount}
                    onChange={(event) => setManualAmount(event.target.value)}
                    placeholder="0.00"
                    style={{
                      height: 38,
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "0 10px",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{tr("Remarks", "टिप्पणी")}</span>
                  <textarea
                    rows={3}
                    value={manualRemarks}
                    onChange={(event) => setManualRemarks(event.target.value)}
                    placeholder={tr(
                      "Describe why this manual pre-checkin is being recorded.",
                      "हे मॅन्युअल प्री-चेक-इन का नोंदवले जात आहे ते सांगा."
                    )}
                    style={{
                      border: "1px solid #cbd5e1",
                      borderRadius: 8,
                      padding: "10px",
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
            </div>

            <footer className="checkin-modal-footer">
              <button
                type="button"
                className="modal-cancel-button"
                onClick={() => setManualCheckInGuest(null)}
                disabled={manualCheckInLoading}
              >
                {tr("Cancel", "रद्द करा")}
              </button>

              <button
                type="button"
                className="modal-confirm-button"
                onClick={submitManualCheckIn}
                disabled={manualCheckInLoading}
              >
                {manualCheckInLoading
                  ? tr("Recording...", "नोंद होत आहे...")
                  : tr("Save Pre-Checkin", "प्री-चेक-इन सेव्ह करा")}
              </button>
            </footer>
          </section>
        </div>
      )}

      {resultModal && (

        <AppModal
          type={resultModal.type}
          title={resultModal.title}
          message={resultModal.message}
          confirmText={tr(
            "OK",
            "ठीक आहे"
          )}
          showCancel={false}
          onClose={() =>
            setResultModal(null)
          }
        />

      )}

    </div>
  );
}

/* =========================================
   DATE FORMAT
========================================= */

function formatDate(
  value: string,
  marathi = false
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleDateString(
    marathi
      ? "mr-IN"
      : "en-IN",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  );
}

export default CheckIn;