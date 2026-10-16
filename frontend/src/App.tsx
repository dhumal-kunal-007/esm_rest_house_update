import {
  useCallback,
  useEffect,
  lazy,
  useRef,
  useState,
} from "react";

import "./App.css";
import {
  apiFetch,
  clearAuthToken,
  getAuthToken,
} from "./api";

import AppModal from "./components/AppModal";

import type {
  AppModalType,
} from "./components/AppModal";

const OtherAuthorityRooms = lazy(() => import("./pages/OtherAuthorityRooms"));

import type {
  ExplicitAuthoritySelection,
} from "./AuthoritySelection";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const DailyReport = lazy(() => import("./pages/DailyReport"));
const CreateUser = lazy(() => import("./pages/CreateUser"));
const Availability = lazy(() => import("./pages/Availability"));
const CustomizeRates = lazy(() => import("./pages/CustomizeRates"));
const Booking = lazy(() => import("./pages/Booking"));
const CheckIn = lazy(() => import("./pages/CheckIn"));
const CheckOut = lazy(() => import("./pages/CheckOut"));
const Housekeeping = lazy(() => import("./pages/Housekeeping"));
const Approval = lazy(() => import("./pages/Approval"));
const LostAndFound = lazy(() => import("./pages/LostAndFound"));
const GuestType = lazy(() => import("./pages/GuestType"));
const Rate = lazy(() => import("./pages/Rate"));
const BookingConfirmation = lazy(() => import("./pages/BookingConfirmation"));
const BookingApproval = lazy(() => import("./pages/BookingApproval"));
const Payment = lazy(() => import("./pages/Payment"));
const Invoice = lazy(() => import("./pages/Invoice"));
const RoomLocked = lazy(() => import("./pages/RoomLocked"));
const PreCheckOut = lazy(() => import("./pages/PreCheckOut"));
const RefundCalculation = lazy(() => import("./pages/RefundCalculation"));
const RefundMemo = lazy(() => import("./pages/RefundMemo"));
const WhatsAppFeedback = lazy(() => import("./pages/WhatsAppFeedback"));

import { LanguageProvider } from "./i18n/LanguageContext";
import { useLanguage } from "./i18n/LanguageContext";

import type {
  BookingDraft,
} from "./pages/Booking";

import type {
  BedSelection,
} from "./pages/Availability";

import type {
  GuestTypeValue,
} from "./pages/GuestType";

import type {
  BedRateDetail,
  RateSelection,
  RateResult,
} from "./pages/Rate";

import type {
  BookingConfirmationData,
  AcceptedAccommodation,
} from "./pages/BookingConfirmation";

import type {
  ApprovalDecision,
  ApprovalAccommodation,
  BookingApprovalData,
} from "./pages/BookingApproval";

import type {
  PaymentData,
} from "./pages/Payment";

import type {
  InvoiceData,
  InvoiceType,
} from "./pages/Invoice";

import type {
  RoomLockedData,
  LockedAccommodation,
} from "./pages/RoomLocked";

import type {
  PreCheckOutData,
  PreCheckOutAccommodation,
} from "./pages/PreCheckOut";

import type {
  RefundCalculationData,
  RefundCalculationAccommodation,
} from "./pages/RefundCalculation";

import type {
  RefundMemoData,
  RefundMemoAccommodation,
} from "./pages/RefundMemo";

import type {
  WhatsAppFeedbackData,
} from "./pages/WhatsAppFeedback";

/* =========================================
   USER ROLES
========================================= */

export type UserRole =
  | "ADMIN"
  | "DY_DIRECTOR"
  | "SUPERINTENDENT"
  | "WELFARE_ORGANISER"
  | "OLC_REST_HOUSE_MANAGER"
  | "RECEPTIONIST";

/* =========================================
   ACCOMMODATION CATEGORY
========================================= */

export type AccommodationCategory =
  | "AC"
  | "Non-AC"
  | "Dormitory"
  | "VIP";

/* =========================================
   USER
========================================= */

export interface User {
  id: string;
  name: string;
  username: string;
  role: UserRole;
  active: boolean;
}

/* =========================================
   BOOKING WORKFLOW STAGE
========================================= */

type BookingStage =
  | "BOOKING"
  | "AVAILABILITY"
  | "GUEST_TYPE"
  | "RATE"
  | "BOOKING_CONFIRMATION"
  | "BOOKING_APPROVAL"
  | "PAYMENT"
  | "INVOICE"
  | "ROOM_LOCKED"
  | "CHECK_IN"
  | "CHECK_OUT"
  | "PRE_CHECK_OUT"
  | "REFUND_CALCULATION"
  | "REFUND_MEMO"
  | "WHATSAPP_FEEDBACK";

/* =========================================
   COMPLETE WORKFLOW STATE
========================================= */

interface WorkflowState {
  stage: BookingStage;

  booking: BookingDraft | null;

  acceptedAccommodation: AcceptedAccommodation[];

  availabilitySelections: BedSelection[];

  guestType: GuestTypeValue | null;

  rateSelection: RateSelection | null;

  rateResult: RateResult | null;

  bookingConfirmation:
    | BookingConfirmationData
    | null;

  approvalDecision:
    | ApprovalDecision
    | null;

  approvalRemarks: string;

  payment: PaymentData | null;

  paymentId: string | null;

  invoice: InvoiceData | null;

  roomLocked: RoomLockedData | null;

  preCheckOut: PreCheckOutData | null;

  refundCalculation:
    | RefundCalculationData
    | null;

  refundMemo:
    | RefundMemoData
    | null;

  feedback:
    | WhatsAppFeedbackData
    | null;
}

/* =========================================
   APP
========================================= */

function AppContent() {
  const { language } = useLanguage();
  const languageRef = useRef(language);

  const bookingProgressQueue = useRef<Promise<void>>(
    Promise.resolve()
  );

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  /* =========================================
     SPLASH
  ========================================= */

  const [
    showSplash,
    setShowSplash,
  ] = useState(true);

  /* =========================================
     USERS
  ========================================= */

  const [
    users,
    setUsers,
  ] = useState<User[]>([]);

  /* =========================================
     LOGGED IN USER
  ========================================= */

  const [
    loggedInUser,
    setLoggedInUser,
  ] = useState<User | null>(null);

  const [
    isRestoringSession,
    setIsRestoringSession,
  ] = useState(true);

  useEffect(() => {
    const restoreSession = async () => {
      if (!getAuthToken()) {
        setIsRestoringSession(false);
        return;
      }

      try {
        const response = await apiFetch(
          "http://localhost:5000/api/auth/me"
        );
        const data = await response.json();

        if (
          !response.ok ||
          !data?.success ||
          !data?.user
        ) {
          throw new Error(
            data?.message || "Your session is no longer valid."
          );
        }

        setLoggedInUser({
          id: data.user.id,
          name: data.user.full_name,
          username: data.user.username,
          role: data.user.role_name as UserRole,
          active: true,
        });
      } catch (error) {
        clearAuthToken();
        console.error("Session restore failed:", error);
      } finally {
        setIsRestoringSession(false);
      }
    };

    void restoreSession();
  }, []);

  /* =========================================
     CURRENT PAGE
  ========================================= */

  const [
    currentPage,
    setCurrentPage,
  ] = useState<
    | "dashboard"
    | "daily-report"
    | "booking"
    | "availability"
    | "customize-rates"
    | "create-user"
    | "otherAuthorityRooms"
    | "check-in"
    | "check-out"
    | "housekeeping"
    | "approvals"
    | "lost-and-found"
    | "workflow"
  >("dashboard");

  /* =========================================
     WORKFLOW STATE
  ========================================= */

  const [
    workflow,
    setWorkflow,
  ] = useState<WorkflowState>({
    stage: "BOOKING",
    booking: null,
    acceptedAccommodation: [],
    availabilitySelections: [],
    guestType: null,
    rateSelection: null,
    rateResult: null,
    bookingConfirmation: null,
    approvalDecision: null,
    approvalRemarks: "",
    payment: null,
    paymentId: null,
    invoice: null,
    roomLocked: null,
    preCheckOut: null,
    refundCalculation: null,
    refundMemo: null,
    feedback: null,
  });

  /* =========================================
     EXPLICIT AUTHORITY SELECTION
  ========================================= */

  const [
    explicitAuthoritySelection,
    setExplicitAuthoritySelection,
  ] = useState<
    ExplicitAuthoritySelection | null
  >(null);

  /* =========================================
     PROFESSIONAL APP MODAL
  ========================================= */

  const [
    modal,
    setModal,
  ] = useState<{
    type: AppModalType;
    title: string;
    message: string;
    onCloseAction?: () => void;
  } | null>(null);

  useEffect(() => {
    if (
      !loggedInUser ||
      ![
        "DY_DIRECTOR",
        "SUPERINTENDENT",
        "WELFARE_ORGANISER",
        "OLC_REST_HOUSE_MANAGER",
      ].includes(loggedInUser.role)
    ) {
      return;
    }

    let isCurrent = true;

    const notifyPendingApprovals = async () => {
      try {
        const response = await apiFetch(
          `http://localhost:5000/api/approvals/pending/${loggedInUser.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }
        );
        const data = await response.json();

        if (!response.ok || !data?.success || !Array.isArray(data.approvals)) {
          throw new Error(
            data?.message || "Unable to check pending booking approvals."
          );
        }

        if (!isCurrent || data.approvals.length === 0) {
          return;
        }

        type PendingApproval = {
          booking_id: string;
          booking_reference?: string | null;
          created_by_name?: string | null;
          check_in_date?: string | null;
          expected_check_out_date?: string | null;
        };
        const approvalsByBooking = new Map<string, PendingApproval>();
        data.approvals.forEach((approval: PendingApproval) => {
          approvalsByBooking.set(approval.booking_id, approval);
        });
        const pendingBookings = Array.from(approvalsByBooking.values());
        const count = pendingBookings.length;
        const currentLanguage = languageRef.current;
        const requestList = pendingBookings
          .map((approval) => {
            const bookingReference =
              approval.booking_reference || approval.booking_id;
            const requester =
              approval.created_by_name ||
              (currentLanguage === "mr"
                ? "विनंतीकर्ता उपलब्ध नाही"
                : "Requester unavailable");
            const stayDates =
              approval.check_in_date && approval.expected_check_out_date
                ? `\n  ${approval.check_in_date} – ${approval.expected_check_out_date}`
                : "";

            return `• ${bookingReference} — ${requester}${stayDates}`;
          })
          .join("\n");

        setModal({
          type: "info",
          title:
            currentLanguage === "mr"
              ? "प्रलंबित बुकिंग मंजुरी"
              : "Pending Booking Approvals",
          message:
            currentLanguage === "mr"
              ? `तुमच्याकडे ${count} बुकिंग${count === 1 ? "" : "ची"} मंजुरी बाकी आहे:\n\n${requestList}\n\nमंजुरी तपासण्यासाठी OK दाबा.`
              : `You have ${count} booking approval${count === 1 ? "" : "s"} waiting:\n\n${requestList}\n\nSelect OK to review them.`,
          onCloseAction: () => setCurrentPage("approvals"),
        });
      } catch (error) {
        console.error("Unable to check pending booking approvals:", error);
      }
    };

    void notifyPendingApprovals();

    return () => {
      isCurrent = false;
    };
  }, [loggedInUser?.id, loggedInUser?.role]);

  /* =========================================
     CLOSE MODAL
  ========================================= */

  const closeModal = () => {
    const action =
      modal?.onCloseAction;

    setModal(null);

    if (action) {
      action();
    }
  };

  /* =========================================
     LOAD USERS
  ========================================= */

  useEffect(() => {

    const loadUsers = async () => {

      if (!loggedInUser) {
        return;
      }

      try {

        const response =
          await apiFetch(
            "http://localhost:5000/api/users"
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
            "Failed to load users."
          );
        }

        if (
          !Array.isArray(
            data.users
          )
        ) {
          throw new Error(
            "Invalid user data received from server."
          );
        }

        const databaseUsers:
          User[] =
          data.users.map(
            (user: {
              id: string;
              name: string;
              username: string;
              role: string;
              active: boolean;
            }) => ({
              id: user.id,
              name: user.name,
              username: user.username,
              role:
                user.role as UserRole,
              active: user.active,
            })
          );

        setUsers(
          databaseUsers
        );

      } catch (error) {

        console.error(
          "Failed to load users:",
          error
        );

        setUsers([]);

      }

    };

    loadUsers();

  }, [loggedInUser?.id]);

  /* =========================================
     SPLASH TIMER
  ========================================= */

  useEffect(() => {

    const timer =
      setTimeout(() => {
        setShowSplash(false);
      }, 2600);

    return () => {
      clearTimeout(timer);
    };

  }, []);

  /* =========================================
     LOGIN
  ========================================= */

  const handleLogin = (
    user: User
  ) => {

    setLoggedInUser(user);

    setCurrentPage(
      "dashboard"
    );

    resetWorkflow();

    setExplicitAuthoritySelection(
      null
    );

    setModal(null);

  };

  /* =========================================
     LOGOUT
  ========================================= */

  const handleLogout = () => {

    clearAuthToken();

    setLoggedInUser(null);

    setCurrentPage(
      "dashboard"
    );

    resetWorkflow();

    setExplicitAuthoritySelection(
      null
    );

    setModal(null);

  };

  /* =========================================
     RESET WORKFLOW
  ========================================= */

  const resetWorkflow = () => {

    setWorkflow({
      stage: "BOOKING",
      booking: null,
      acceptedAccommodation: [],
      availabilitySelections: [],
      guestType: null,
      rateSelection: null,
      rateResult: null,
      bookingConfirmation: null,
      approvalDecision: null,
      approvalRemarks: "",
      payment: null,
      paymentId: null,
      invoice: null,
      roomLocked: null,
      preCheckOut: null,
      refundCalculation: null,
      refundMemo: null,
      feedback: null,
    });

  };

  /* =========================================
     CREATE USER
  ========================================= */

  const handleCreateUser = (
    newUser: User
  ) => {

    setUsers(
      (currentUsers) => [
        ...currentUsers,
        newUser,
      ]
    );

    setCurrentPage(
      "dashboard"
    );

  };

  /* =========================================
     DELETE / DEACTIVATE USER
  ========================================= */

  const handleDeleteUser = async (
    userId: string
  ) => {

    if (!loggedInUser) {

      setModal({
        type: "error",
        title: "Session Expired",
        message:
          "Your user session is missing. Please login again.",
      });

      return;
    }

    if (
      loggedInUser.role !==
      "ADMIN"
    ) {

      setModal({
        type: "error",
        title: "Access Denied",
        message:
          "Only an ADMIN can delete or deactivate users.",
      });

      return;
    }

    if (
      loggedInUser.id ===
      userId
    ) {

      setModal({
        type: "warning",
        title: "Action Not Allowed",
        message:
          "You cannot deactivate your own account.",
      });

      return;
    }

    try {

      const response =
        await apiFetch(
          `http://localhost:5000/api/users/${userId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                adminUserId:
                  loggedInUser.id,
              }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        setModal({
          type: "error",
          title:
            "User Could Not Be Deleted",
          message:
            data.message ||
            "Unable to deactivate the selected user.",
        });

        return;
      }

      setUsers(
        (currentUsers) =>
          currentUsers.map(
            (user) =>
              user.id === userId
                ? {
                    ...user,
                    active: false,
                  }
                : user
          )
      );

      setModal({
        type: "success",
        title:
          "User Deactivated",
        message:
          data.message ||
          "The user has been deactivated successfully.",
      });

    } catch (error) {

      console.error(
        "Delete user error:",
        error
      );

      setModal({
        type: "error",
        title:
          "Server Unavailable",
        message:
          "Unable to connect to the user management server.",
      });

    }

  };

  /* =========================================
     ROLE → CATEGORY
  ========================================= */

  const getAccommodationCategory = (
    role: UserRole
  ): AccommodationCategory => {

    switch (role) {

      case "DY_DIRECTOR":
        return "VIP";

      case "SUPERINTENDENT":
      case "WELFARE_ORGANISER":
      case "OLC_REST_HOUSE_MANAGER":
        return "AC";

      case "RECEPTIONIST":
        return "Non-AC";

      case "ADMIN":
      default:
        return "AC";

    }

  };

  /* =========================================
     AUTHORITY CATEGORY
  ========================================= */

  const getAuthorityBookingCategory = (
    categoryName: string
  ): AccommodationCategory => {

    switch (
      String(
        categoryName
      )
        .toUpperCase()
        .replace(
          /[\s-]+/g,
          "_"
        )
    ) {

      case "VIP":
      case "AC_VIP":
        return "VIP";

      case "NON_AC":
      case "NAC":
        return "Non-AC";

      case "DORMITORY":
      case "DM":
        return "Dormitory";

      case "AC":
      default:
        return "AC";

    }

  };

  /* =========================================
     RATE CATEGORY CONVERSION
  ========================================= */

  const getRateAccommodationCategory = (
    category: AccommodationCategory
  ):
    | "AC"
    | "NON_AC"
    | "DORMITORY"
    | "HALL"
    | "VIP" => {

    switch (category) {

      case "Non-AC":
        return "NON_AC";

      case "Dormitory":
        return "DORMITORY";

      case "VIP":
        return "VIP";

      case "AC":
      default:
        return "AC";

    }

  };

  /* =========================================
     ACCEPTED ACCOMMODATION CATEGORY
  ========================================= */

  const getAcceptedAccommodationCategory = (
    item: AcceptedAccommodation
  ): RateSelection["accommodationCategory"] => {

    const roomName =
      String(
        item.roomName || ""
      ).toUpperCase();

    if (
      roomName.startsWith(
        "AC VIP"
      ) ||
      roomName.startsWith(
        "VIP"
      )
    ) {
      return "VIP";
    }

    if (
      roomName.startsWith(
        "NAC"
      )
    ) {
      return "NON_AC";
    }

    if (
      roomName.startsWith(
        "DM"
      )
    ) {
      return "DORMITORY";
    }

    if (
      roomName.startsWith(
        "HALL"
      )
    ) {
      return "HALL";
    }

    return "AC";
  };

  /* =========================================
     NEW BOOKING
  ========================================= */

  const handleNewBooking = () => {

    resetWorkflow();

    setExplicitAuthoritySelection(
      null
    );

    setCurrentPage(
      "booking"
    );

  };

  /* =========================================
     AUTHORITY ROOM
  ========================================= */

  const handleExplicitAuthoritySelection = (
    selection: ExplicitAuthoritySelection
  ) => {

    setExplicitAuthoritySelection(
      selection
    );

    resetWorkflow();

    setCurrentPage(
      "booking"
    );

  };

  /* =========================================
     BOOKING → DATABASE
  ========================================= */

  const handleBookingContinue = async (
    booking: BookingDraft
  ) => {

    if (!loggedInUser) {

      setModal({
        type: "error",
        title: "Session Expired",
        message:
          "Please login again.",
      });

      return;
    }

    const bookingToSave: BookingDraft = {
      ...booking,
      id: booking.id ?? workflow.booking?.id,
      guests: booking.guests.map((guest, index) => ({
        ...guest,
        id: guest.id ?? workflow.booking?.guests[index]?.id,
      })),
    };

    try {
      const bookingPayload = {

                booking_type:
                  bookingToSave.bookingType,

                check_in_date:
                  bookingToSave.checkIn
                    .split("T")[0],

                expected_check_out_date:
                  bookingToSave.checkOut
                    .split("T")[0],

                number_of_guests:
                  bookingToSave.guests.length,

                purpose_of_visit:
                  "Rest House Accommodation",

                special_requirements:
                  null,

                is_emergency:
                  false,

                service_member: {
                  service_number:
                    bookingToSave.serviceman.number,
                  rank:
                    bookingToSave.serviceman.rank,
                  full_name:
                    bookingToSave.serviceman.name,
                  mobile_number:
                    bookingToSave.serviceman.mobile,
                  address:
                    bookingToSave.serviceman.address,
                  aadhaar_number:
                    bookingToSave.serviceman.aadhaar,
                },

                created_by:
                  loggedInUser.id,

                guests:
                  bookingToSave.guests.map(
                    (guest) => ({
                    id:
                      guest.id,

                    name:
                      guest.name,

                      gender:
                        guest.gender,

                      actualGender:
                        guest.actualGender,

                      relationship:
                        guest.relationship,

                      mobile:
                        guest.mobile,

                      address:
                        guest.address,

                      aadhaar:
                        guest.aadhaar,

                      relationshipProofType:
                        guest.relationshipProofType,

                      relationshipProofNumber:
                        guest.relationshipProofNumber,
                    })
                  ),

              };
      const hasDocuments = Boolean(
        bookingToSave.serviceman.document ||
          bookingToSave.guests.some((guest) => guest.document)
      );
      const requestHeaders: HeadersInit = hasDocuments
        ? {}
        : { "Content-Type": "application/json" };
      let requestBody: BodyInit;
      if (hasDocuments) {
        const formData = new FormData();
        formData.append(
          "booking_payload",
          JSON.stringify(bookingPayload)
        );
        if (bookingToSave.serviceman.document) {
          formData.append(
            "booking_person_document",
            bookingToSave.serviceman.document
          );
        }
        bookingToSave.guests.forEach((guest, index) => {
          if (guest.document) {
            formData.append(
              `occupant_document_${index}`,
              guest.document
            );
          }
        });
        requestBody = formData;
      } else {
        requestBody = JSON.stringify(bookingPayload);
      }

      const response = await apiFetch(
        bookingToSave.id
          ? `http://localhost:5000/api/bookings/${bookingToSave.id}`
          : "http://localhost:5000/api/bookings",
        {
          method: bookingToSave.id ? "PUT" : "POST",
          headers: requestHeaders,
          body: requestBody,
        }
      );

      const data =
        await response.json();

      if (!response.ok) {

        setModal({
          type: "error",
          title:
            bookingToSave.id
              ? "Booking Could Not Be Updated"
              : "Booking Could Not Be Created",
          message:
            data.message ||
            (bookingToSave.id
              ? "Unable to update booking."
              : "Unable to create booking."),
        });

        return;
      }

      const bookingId = bookingToSave.id || data.booking?.id;
      if (!bookingId) {

        setModal({
          type: "error",
          title:
            "Booking ID Missing",
          message:
            "The booking ID was not returned by the server.",
        });

        return;
      }

      if (
        !Array.isArray(
          data.guests
        )
      ) {

        setModal({
          type: "error",
          title:
            "Guest Information Error",
          message:
            "Guest information could not be linked correctly.",
        });

        return;
      }

      const bookingWithIds:
        BookingDraft = {

        ...bookingToSave,

        id:
          bookingId,

        guests:
          bookingToSave.guests.map(
            (
              guest,
              index
            ) => ({
              ...guest,
              id:
                data.guests[index]?.id ?? guest.id,
            })
          ),

      };

      const retainedSelections =
        workflow.availabilitySelections
          .filter((selection) =>
            bookingWithIds.guests.some(
              (guest) => guest.id === selection.guestId
            )
          )
          .map((selection) => ({
            ...selection,
            occupantName:
              bookingWithIds.guests.find(
                (guest) => guest.id === selection.guestId
              )?.name ?? selection.occupantName,
          }));
      const bookingRemainsApproved =
        data.booking?.approval_status === "APPROVED";
      setWorkflow(
        (current) => ({
          ...current,
          stage:
            "AVAILABILITY",
          booking:
            bookingWithIds,
          availabilitySelections:
            retainedSelections,
          ...(bookingRemainsApproved
            ? {}
            : {
                guestType: null,
                rateSelection: null,
                rateResult: null,
                bookingConfirmation: null,
                approvalDecision: null,
                approvalRemarks: "",
              }),
        })
      );
      setCurrentPage("workflow");

      if (!bookingRemainsApproved) {
        await saveBookingProgress(
          bookingId,
          "AVAILABILITY",
          {
            availability_selections: retainedSelections,
          }
        );
      }

      if (!bookingToSave.id) {
        setModal({
          type: "success",
          title:
            "Booking Created",
          message:
            `Booking Reference: ${
              data.booking.booking_reference
            }`,
        });
      }

    } catch (error) {

      console.error(
        "Booking API error:",
        error
      );

      setModal({
        type: "error",
        title:
          "Booking Server Unavailable",
        message:
          "Unable to connect to the booking server.",
      });

    }

  };

  /* =========================================
     ACCEPTANCE
  ========================================= */

  const saveBookingProgress = async (
    bookingId: string,
    currentStep:
      | "AVAILABILITY"
      | "GUEST_TYPE"
      | "RATE"
      | "BOOKING_CONFIRMATION"
      | "COMPLETED",
    progressData: Record<string, unknown> = {}
  ) => {
    const save = bookingProgressQueue.current.then(async () => {
      const response = await apiFetch(
        `http://localhost:5000/api/bookings/${bookingId}/progress`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            current_step: currentStep,
            progress_data: progressData,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || "Unable to save booking progress."
        );
      }
    });
    bookingProgressQueue.current = save.catch(() => undefined);
    await save;
  };

  const handleAvailabilitySelectionsChange = useCallback(
    async (selections: BedSelection[]) => {
      const bookingId = workflow.booking?.id;
      if (!bookingId) {
        return;
      }

      setWorkflow((current) => ({
        ...current,
        availabilitySelections: selections,
      }));
      try {
        await saveBookingProgress(bookingId, "AVAILABILITY", {
          availability_selections: selections,
        });
      } catch (error) {
        console.error("Booking draft selection save error:", error);
        setModal({
          type: "error",
          title: "Booking Progress Could Not Be Saved",
          message:
            error instanceof Error
              ? error.message
              : "Your accommodation selections could not be saved. Please retry before leaving this page.",
        });
      }
    },
    [workflow.booking?.id]
  );

  const handleResumeBooking = async (bookingId: string) => {
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/bookings/${bookingId}/resume`
      );
      const data = await response.json();
      if (!response.ok || !data?.success || !data.booking) {
        throw new Error(
          data?.message || "Unable to resume this booking."
        );
      }

      const savedBooking = data.booking;
      const pricing = data.pricing;
      const guests = (savedBooking.guests ?? []).map(
        (guest: Record<string, unknown>) => ({
          id: String(guest.id),
          name: String(guest.guest_name ?? ""),
          gender: String(guest.gender ?? ""),
          actualGender: String(guest.gender ?? ""),
          ...(["CHILD", "GUEST"].includes(String(guest.guest_category ?? "").toUpperCase())
            ? { gender: String(guest.guest_category).toUpperCase() }
            : {}),
          relationship: String(guest.relationship ?? ""),
          mobile: String(guest.mobile_number ?? ""),
          address: String(guest.address ?? ""),
          relationshipProofType: String(
            guest.relationship_proof_type ?? ""
          ),
          relationshipProofNumber: String(
            guest.relationship_proof_number ?? ""
          ),
          aadhaar: "",
        })
      );

      const booking: BookingDraft = {
        id: String(savedBooking.id),
        category: (() => {
          const category = String(
            pricing?.accommodationCategory ??
              data.accepted_accommodation?.[0]?.category_name ??
              ""
          )
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, "_");
          if (category === "NON_AC") return "Non-AC";
          if (category === "DORMITORY") return "Dormitory";
          if (category === "VIP") return "VIP";
          if (category === "AC") return "AC";
          return getAccommodationCategory(loggedInUser?.role ?? "RECEPTIONIST");
        })(),
        bookingType: savedBooking.booking_type,
        serviceman: {
          number: String(
            savedBooking.service_member?.service_number ?? ""
          ),
          rank: String(savedBooking.service_member?.rank ?? ""),
          name: String(savedBooking.service_member?.full_name ?? ""),
          mobile: String(savedBooking.service_member?.mobile ?? ""),
          address: String(savedBooking.service_member?.address ?? ""),
          aadhaar: "",
        },
        guests,
        checkIn: String(savedBooking.check_in_date).includes("T")
          ? String(savedBooking.check_in_date)
          : `${savedBooking.check_in_date}T13:00`,
        checkOut: String(savedBooking.check_out_date).includes("T")
          ? String(savedBooking.check_out_date)
          : `${savedBooking.check_out_date}T13:00`,
      };

      const acceptedAccommodation: AcceptedAccommodation[] =
        (data.accepted_accommodation ?? []).map(
          (accepted: Record<string, unknown>) => ({
            roomId: String(accepted.room_id),
            roomName: String(accepted.room_number),
            ...(accepted.bed_id
              ? {
                  bedId: String(accepted.bed_id),
                  bedNumber: Number(accepted.bed_number),
                }
              : {}),
            guestId: String(accepted.guest_id),
            guestName: String(accepted.guest_name),
          })
        );

      const savedSelections =
        Array.isArray(data.progress_data?.availability_selections)
          ? data.progress_data.availability_selections
          : [];
      const selectionByGuest = new Map<string, BedSelection>();
      for (const item of acceptedAccommodation) {
        selectionByGuest.set(item.guestId, {
          roomId: item.roomId,
          roomName: item.roomName,
          bedId: item.bedId ?? "",
          bedNumber: item.bedNumber ?? 0,
          occupantName: item.guestName,
          guestId: item.guestId,
        });
      }
      for (const item of savedSelections) {
        if (
          item &&
          typeof item.roomId === "string" &&
          typeof item.guestId === "string"
        ) {
          selectionByGuest.set(item.guestId, item as BedSelection);
        }
      }
      const availabilitySelections = Array.from(
        selectionByGuest.values()
      );

      const guestType =
        pricing?.guestType ??
        data.progress_data?.guest_type ??
        null;
      const rateSelection: RateSelection | null = pricing
        ? {
            guestType,
            accommodationCategory:
              pricing.accommodationCategory,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            numberOfRooms: new Set(
              acceptedAccommodation
                .filter((item) => !item.bedId)
                .map((item) => item.roomId)
            ).size,
            numberOfBeds: new Set(
              acceptedAccommodation
                .filter((item) => Boolean(item.bedId))
                .map((item) => item.bedId)
            ).size,
            additionalRetiredMembers: Number(
              pricing.additionalRetiredMembers ?? 0
            ),
            additionalOtherRelations: Number(
              pricing.additionalOtherRelations ?? 0
            ),
          }
        : null;
      const rateResult: RateResult | null = pricing
        ? {
            accommodationRate: Number(pricing.accommodationRate),
            accommodationDays: Number(pricing.accommodationDays),
            accommodationAmount: Number(pricing.accommodationAmount),
            additionalRetiredAmount: Number(
              pricing.additionalRetiredAmount
            ),
            additionalOtherRelationAmount: Number(
              pricing.additionalOtherRelationAmount
            ),
            additionalMemberAmount: Number(
              pricing.additionalMemberAmount
            ),
            totalAmount: Number(pricing.totalAmount),
            bedRateDetails: Array.isArray(
              data.progress_data?.dm_bed_rate_details
            )
              ? data.progress_data.dm_bed_rate_details as BedRateDetail[]
              : [],
          }
        : null;
      const savedPayment = data.payment as
          | Record<string, unknown>
          | null;
      const paymentMethod = String(
          savedPayment?.payment_method ?? ""
      ).toUpperCase();
      if (
          savedPayment &&
          !["CASH", "ONLINE", "UPI", "CHEQUE"].includes(paymentMethod)
      ) {
          throw new Error(
            "The saved payment method is not recognized."
          );
      }
      const resumedPayment: PaymentData | null =
          savedPayment && guestType && rateResult
            ? {
                bookingId: booking.id,
                guestName:
                  booking.guests[0]?.name ||
                  booking.serviceman.name,
                guestType,
                approvedAmount: rateResult.totalAmount,
                amountReceived: Number(savedPayment.amount),
                paymentMethod:
                  paymentMethod as PaymentData["paymentMethod"],
                transactionNumber: String(
                  savedPayment.transaction_number ?? ""
                ),
                paymentDate: String(
                  savedPayment.payment_date ?? ""
                ).slice(0, 10),
                remarks: String(savedPayment.remarks ?? ""),
              }
            : null;
      const savedInvoice = data.invoice as
          | Record<string, unknown>
          | null;
      const invoiceType = String(
          savedInvoice?.invoice_type ?? ""
      ).toUpperCase();
      if (
          savedInvoice &&
          !["CASH_MEMO", "CREDIT_MEMO"].includes(invoiceType)
      ) {
          throw new Error(
            "The saved invoice type is not recognized."
          );
      }
      const resumedInvoice: InvoiceData | null =
          savedInvoice && resumedPayment && guestType && rateResult
            ? {
                bookingId: booking.id,
                bookingReference: String(
                  savedBooking.booking_reference ?? ""
                ),
                invoiceType: invoiceType as InvoiceType,
                invoiceNumber: String(
                  savedInvoice.invoice_number ?? ""
                ),
                invoiceDate: String(
                  savedInvoice.invoice_date ?? ""
                ).slice(0, 10),
                guestName:
                  booking.guests[0]?.name ||
                  booking.serviceman.name,
                guestType,
                totalAmount: rateResult.totalAmount,
                paidAmount: Number(savedInvoice.amount),
                balanceAmount:
                  rateResult.totalAmount -
                  Number(savedInvoice.amount),
                paymentMethod:
                  resumedPayment.paymentMethod,
                transactionNumber:
                  resumedPayment.transactionNumber,
                remarks: resumedPayment.remarks,
              }
            : null;
      const bookingConfirmation: BookingConfirmationData | null =
        rateSelection && rateResult && guestType
          ? {
              bookingType: booking.bookingType,
              category: rateSelection.accommodationCategory,
              serviceman: booking.serviceman,
              guests,
              checkIn: booking.checkIn,
              checkOut: booking.checkOut,
              acceptedAccommodation,
              guestType,
              rateSelection,
              rateResult,
            }
          : null;

      const stage = data.current_step as BookingStage;
      setExplicitAuthoritySelection(null);
      setWorkflow((current) => ({
        ...current,
        stage,
        booking,
        acceptedAccommodation,
        availabilitySelections,
        guestType,
        rateSelection,
        rateResult,
        bookingConfirmation,
        payment: resumedPayment,
        paymentId:
          savedPayment?.id == null
            ? null
            : String(savedPayment.id),
        invoice: resumedInvoice,
        approvalDecision:
          savedBooking.approval_status === "APPROVED"
            ? "APPROVED"
            : null,
      }));
      setCurrentPage("workflow");
    } catch (error) {
      console.error("Booking resume error:", error);
      setModal({
        type: "error",
        title: "Booking Could Not Be Resumed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to load the existing booking.",
      });
    }
  };

  const handleConfirmAcceptance = async (
    selections: BedSelection[]
  ) => {
    console.log(
  "ACCEPTANCE DEBUG - workflow.booking:",
  workflow.booking
);

console.log(
  "ACCEPTANCE DEBUG - booking.id:",
  workflow.booking?.id
);

console.log(
  "ACCEPTANCE DEBUG - selections:",
  selections
);

    if (!loggedInUser) {

      setModal({
        type: "error",
        title: "Session Expired",
        message:
          "Please login again.",
      });

      return;
    }

    if (!workflow.booking?.id) {

      setModal({
        type: "error",
        title:
          "Booking ID Missing",
        message:
          "The booking ID is missing.",
      });

      return;
    }

    if (
      !Array.isArray(
        selections
      ) ||
      selections.length === 0
    ) {

      setModal({
        type: "warning",
        title:
          "Selection Required",
        message:
          "Please select a room or bed before continuing.",
      });

      return;
    }

    const guestIds =
      selections.map(
        (selection) =>
          selection.guestId
      );

    if (
      guestIds.some(
        (id) => !id
      )
    ) {

      setModal({
        type: "warning",
        title:
          "Guest Assignment Required",
        message:
          "Every selected accommodation must have a guest assigned.",
      });

      return;
    }

    if (
      new Set(
        guestIds
      ).size !==
      guestIds.length
    ) {

      setModal({
        type: "warning",
        title:
          "Duplicate Guest Assignment",
        message:
          "The same guest cannot be assigned more than once.",
      });

      return;
    }

    const bookingGuestIds =
      workflow.booking.guests
        .map(
          (guest) =>
            guest.id
        )
        .filter(
          (
            id
          ): id is string =>
            Boolean(id)
        );

    for (
      const guestId
      of guestIds
    ) {

      if (
        !bookingGuestIds.includes(
          guestId
        )
      ) {

        setModal({
          type: "error",
          title:
            "Invalid Guest",
          message:
            "One or more selected guests do not belong to this booking.",
        });

        return;
      }

    }

    try {
      let resultingApprovalStatus: string | undefined;

      for (
        const selection
        of selections
      ) {

        const response =
          await apiFetch(
            "http://localhost:5000/api/acceptances",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({

                  booking_id:
                    workflow.booking.id,

                  guest_id:
                    selection.guestId,

                  room_id:
                    selection.roomId,

                  ...(selection.bedId
                    ? {
                        bed_id:
                          selection.bedId,
                      }
                    : {}),

                  remarks:
                    "Guest accepted selected accommodation.",

                }),

            }
          );

        const data =
          await response.json();

        if (!response.ok) {

          throw new Error(
            [
              data.message ||
                "Unable to save accommodation acceptance.",
              data.error,
            ]
              .filter(
                (detail): detail is string =>
                  typeof detail === "string" &&
                  detail.trim().length > 0
              )
              .join(" ")
          );

        }

        resultingApprovalStatus =
          data.booking?.approval_status;

      }

      const acceptedAccommodation:
        AcceptedAccommodation[] =
        selections.map(
          (selection) => ({

            roomId:
              selection.roomId,

            roomName:
              selection.roomName,

            bedId:
              selection.bedId ||
              undefined,

            bedNumber:
              selection.bedNumber ||
              undefined,

            guestId:
              selection.guestId,

            guestName:
              selection.occupantName,

          })
        );

      const remainsApproved =
        resultingApprovalStatus === "APPROVED";
      const nextStage: BookingStage =
        remainsApproved ? "PAYMENT" : "GUEST_TYPE";

      if (!remainsApproved) {
        await saveBookingProgress(
          workflow.booking.id,
          "GUEST_TYPE",
          {
            availability_selections: selections,
          }
        );
      }

      setWorkflow(
        (current) => ({
          ...current,
          stage: nextStage,
          acceptedAccommodation,
          availabilitySelections:
            selections,
          ...(remainsApproved
            ? { approvalDecision: "APPROVED" }
            : {
                guestType: null,
                rateSelection: null,
                rateResult: null,
                bookingConfirmation: null,
                approvalDecision: null,
                approvalRemarks: "",
              }),
        })
      );

      setModal({
        type: "success",
        title: remainsApproved
          ? "Accommodation Confirmed"
          : "Accommodation Accepted",
        message: remainsApproved
          ? "The existing approved accommodation is unchanged. Continue to payment."
          : "The selected room/bed has been accepted. Pricing and approval must be completed before payment and physical room locking.",
        onCloseAction: () => {
          setCurrentPage(
            "workflow"
          );
        },
      });

    } catch (error) {

      console.error(
        "Acceptance API error:",
        error
      );

      setModal({
        type: "error",
        title:
          "Acceptance Could Not Be Saved",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save accommodation acceptance.",
      });

    }

  };

  /* =========================================
     GUEST TYPE
  ========================================= */

  const handleGuestTypeContinue = async (
    guestType: GuestTypeValue
  ) => {

    if (!workflow.booking?.id) {
      return;
    }

    try {
      await saveBookingProgress(
        workflow.booking.id,
        "RATE",
        { guest_type: guestType }
      );
    } catch (error) {
      setModal({
        type: "error",
        title: "Booking Progress Could Not Be Saved",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save the selected guest type.",
      });
      return;
    }

    setWorkflow(
      (current) => ({
        ...current,
        stage:
          "RATE",
        guestType,
      })
    );

  };

  const handleBookingStepBack = async (
    currentStep:
      | "AVAILABILITY"
      | "GUEST_TYPE"
      | "RATE"
      | "BOOKING_CONFIRMATION",
    nextStage:
      | "AVAILABILITY"
      | "GUEST_TYPE"
      | "RATE"
      | "BOOKING_CONFIRMATION"
  ) => {
    if (workflow.booking?.id) {
      try {
        await saveBookingProgress(
          workflow.booking.id,
          currentStep,
          workflow.guestType
            ? { guest_type: workflow.guestType }
            : {}
        );
      } catch (error) {
        setModal({
          type: "error",
          title: "Booking Progress Could Not Be Saved",
          message:
            error instanceof Error
              ? error.message
              : "Unable to save the current booking step.",
        });
        return;
      }
    }

    setWorkflow((current) => ({
      ...current,
      stage: nextStage,
    }));
  };

  /* =========================================
     RATE
  ========================================= */

  const handleRateContinue = async (
    selection: RateSelection
  ) => {

    if (
      !workflow.booking ||
      !workflow.guestType
    ) {
      return;
    }

    try {
      const response = await apiFetch(
        `http://localhost:5000/api/bookings/${workflow.booking.id}/pricing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            guest_type: workflow.guestType,
            accommodation_category:
              selection.accommodationCategory,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || !data?.pricing) {
        throw new Error(
          data?.message || "Unable to calculate booking pricing."
        );
      }

      const authoritativeResult: RateResult = {
        accommodationRate:
          Number(data.pricing.accommodationRate),
        accommodationDays:
          Number(data.pricing.accommodationDays),
        accommodationAmount:
          Number(data.pricing.accommodationAmount),
        additionalRetiredAmount:
          Number(data.pricing.additionalRetiredAmount),
        additionalOtherRelationAmount:
          Number(data.pricing.additionalOtherRelationAmount),
        additionalMemberAmount:
          Number(data.pricing.additionalMemberAmount),
        totalAmount:
          Number(data.pricing.totalAmount),
        bedRateDetails: Array.isArray(data.pricing.dmBedRateDetails)
          ? data.pricing.dmBedRateDetails as BedRateDetail[]
          : [],
      };

      setWorkflow((current) => ({
        ...current,
        stage: "BOOKING_CONFIRMATION",
        rateSelection: selection,
        rateResult: authoritativeResult,
      }));
    } catch (error) {
      console.error("Booking pricing API error:", error);
      setModal({
        type: "error",
        title: "Pricing Could Not Be Saved",
        message:
          error instanceof Error
            ? error.message
            : "Unable to calculate and save booking pricing.",
      });
    }

  };

  /* =========================================
     BOOKING CONFIRMATION
  ========================================= */

  const handleBookingConfirmation = async () => {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.rateSelection ||
      !workflow.rateResult
    ) {

      setModal({
        type: "error",
        title:
          "Booking Information Incomplete",
        message:
          "Guest type and rate information are required before continuing.",
      });

      return;
    }

    if (!workflow.booking.id) {
      setModal({
        type: "error",
        title: "Booking ID Missing",
        message: "The existing booking ID is required to complete this submission.",
      });
      return;
    }

    try {
      await saveBookingProgress(
        workflow.booking.id,
        "BOOKING_CONFIRMATION",
        {
          guest_type: workflow.guestType,
          availability_selections:
            workflow.availabilitySelections,
        }
      );
    } catch (error) {
      setModal({
        type: "error",
        title: "Booking Progress Could Not Be Saved",
        message:
          error instanceof Error
            ? error.message
            : "Unable to save the booking confirmation progress.",
      });
      return;
    }

    const confirmation:
      BookingConfirmationData = {

      bookingType:
        workflow.booking.bookingType,

      category:
        String(
          workflow.rateSelection
            .accommodationCategory
        ),

      serviceman:
        workflow.booking.serviceman,

      guests:
        workflow.booking.guests,

      checkIn:
        workflow.booking.checkIn,

      checkOut:
        workflow.booking.checkOut,

      acceptedAccommodation:
        workflow.acceptedAccommodation,

      guestType:
        workflow.guestType,

      rateSelection:
        workflow.rateSelection,

      rateResult:
        workflow.rateResult,

    };

    setWorkflow(
      (current) => ({
        ...current,
        stage:
          "BOOKING_APPROVAL",
        bookingConfirmation:
          confirmation,
      })
    );

  };

  /* =========================================
     APPROVAL
  ========================================= */

  const handleApprovalDecision = async (
    decision: ApprovalDecision,
    remarks: string
  ) => {
    if (!loggedInUser) {
      setModal({
        type: "error",
        title: "Session Expired",
        message: "Please login again.",
      });
      return;
    }

    if (!workflow.booking?.id) {
      setModal({
        type: "error",
        title: "Booking ID Missing",
        message:
          "Booking ID is required for approval.",
      });
      return;
    }

    if (
      decision === "REJECTED" &&
      !remarks.trim()
    ) {
      setModal({
        type: "warning",
        title: "Remarks Required",
        message:
          "Please enter remarks before rejecting the booking.",
      });
      return;
    }

    try {
      const endpoint =
        decision === "APPROVED"
          ? `http://localhost:5000/api/approvals/${workflow.booking.id}/approve`
          : `http://localhost:5000/api/approvals/${workflow.booking.id}/reject`;

      const response = await apiFetch(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            approver_id:
              loggedInUser.id,
            remarks:
              remarks.trim() || null,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        const alreadyApproved =
          decision === "APPROVED" &&
          String(data.message || "").toLowerCase().includes("already approved");
        if (alreadyApproved) {
          setWorkflow((current) => ({
            ...current,
            approvalDecision: "APPROVED",
            approvalRemarks: remarks,
            stage: "PAYMENT",
          }));
          setModal({
            type: "success",
            title: "Booking Already Approved",
            message: "This booking is already approved. Proceed to payment.",
            onCloseAction: () => setCurrentPage("workflow"),
          });
          return;
        }
        throw new Error(
          data.message ||
          "Unable to process booking approval."
        );
      }

      if (decision === "APPROVED") {
        setWorkflow((current) => ({
          ...current,
          approvalDecision:
            "APPROVED",
          approvalRemarks:
            remarks,
          stage: "PAYMENT",
        }));

        setModal({
          type: "success",
          title:
            "Booking Approved",
          message:
            data.message ||
            "Booking has been approved successfully. Proceed to payment.",
          onCloseAction: () => {
            setCurrentPage(
              "workflow"
            );
          },
        });

        return;
      }

      setWorkflow((current) => ({
        ...current,
        approvalDecision:
          "REJECTED",
        approvalRemarks:
          remarks,
        stage:
          "BOOKING_APPROVAL",
      }));

      setModal({
        type: "warning",
        title:
          "Booking Rejected",
        message:
          data.message ||
          "The booking has been rejected successfully.",
        onCloseAction: () => {
          resetWorkflow();
          setCurrentPage(
            "dashboard"
          );
        },
      });
    } catch (error) {
      console.error(
        "Approval API error:",
        error
      );

      setModal({
        type: "error",
        title:
          "Approval Failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to process booking approval.",
      });
    }
  };

  /* =========================================
     PAYMENT
  ========================================= */

  const handlePaymentContinue = async (
    payment: PaymentData
  ) => {
    if (workflow.paymentId) {
      setWorkflow((current) => ({
        ...current,
        stage: "INVOICE",
      }));
      return;
    }

    if (!loggedInUser) {
      setModal({
        type: "error",
        title: "Session Expired",
        message: "Please login again.",
      });
      return;
    }

    if (!workflow.booking?.id) {
      setModal({
        type: "error",
        title: "Booking ID Missing",
        message:
          "Booking ID is required for payment.",
      });
      return;
    }

    if (!workflow.guestType) {
      setModal({
        type: "error",
        title: "Guest Type Missing",
        message:
          "Guest type is required before payment.",
      });
      return;
    }

    if (!workflow.rateResult) {
      setModal({
        type: "error",
        title: "Rate Information Missing",
        message:
          "Approved booking amount is not available.",
      });
      return;
    }

    const primaryGuest =
      workflow.booking.guests[0];

    if (!primaryGuest?.id) {
      setModal({
        type: "error",
        title: "Guest ID Missing",
        message:
          "Primary guest information is missing.",
      });
      return;
    }

    try {
      const response =
        await apiFetch(
          "http://localhost:5000/api/payments",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              booking_id:
                workflow.booking.id,
              guest_id:
                primaryGuest.id,
              amount:
                payment.amountReceived,
              payment_method:
                payment.paymentMethod,
              transaction_number:
                payment.transactionNumber ||
                null,
              payment_date:
                payment.paymentDate,
              remarks:
                payment.remarks || null,
              received_by:
                loggedInUser.id,
            }),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Unable to record payment."
        );
      }

      const paymentId =
        data.payment?.id ||
        data.payment_id ||
        data.id;

      if (!paymentId) {
        throw new Error(
          "Payment was recorded, but the payment ID was not returned by the server."
        );
      }

      setWorkflow((current) => ({
        ...current,
        payment,
        paymentId,
        stage: "INVOICE",
      }));

      setModal({
        type: "success",
        title:
          "Payment Recorded",
        message:
          `Payment of ₹${payment.amountReceived.toFixed(
            2
          )} has been recorded successfully.`,
        onCloseAction: () => {
          setCurrentPage(
            "workflow"
          );
        },
      });
    } catch (error) {
      console.error(
        "Payment API error:",
        error
      );

      setModal({
        type: "error",
        title:
          "Payment Failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to record payment.",
      });
    }
  };

  /* =========================================
     INVOICE
  ========================================= */

  const handleInvoiceContinue = async (
    invoice: InvoiceData
  ) => {
    if (!loggedInUser) {
      setModal({
        type: "error",
        title: "Session Expired",
        message: "Please login again.",
      });
      return;
    }

    if (!workflow.booking?.id) {
      setModal({
        type: "error",
        title: "Booking ID Missing",
        message:
          "Booking ID is required for invoice generation.",
      });
      return;
    }

    if (!workflow.paymentId) {
      setModal({
        type: "error",
        title: "Payment ID Missing",
        message:
          "The payment ID is missing. Please return to payment and record the payment again.",
      });
      return;
    }

    try {
      const response = await apiFetch(
        "http://localhost:5000/api/invoices",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            booking_id:
              workflow.booking.id,
            payment_id:
              workflow.paymentId,
            invoice_type:
              invoice.invoiceType,
            invoice_date:
              invoice.invoiceDate,
            amount:
              invoice.paidAmount,
            generated_by:
              loggedInUser.id,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
          "Unable to generate invoice."
        );
      }

      const generatedInvoiceNumber =
        data.invoice?.invoice_number;
      if (
        typeof generatedInvoiceNumber !== "string" ||
        !/^\d{8}$/.test(generatedInvoiceNumber)
      ) {
        throw new Error(
          "The invoice was created, but the server did not return its generated invoice number."
        );
      }

      const savedInvoice: InvoiceData = {
        ...invoice,
        invoiceNumber: generatedInvoiceNumber,
        bookingReference:
          data.booking?.booking_reference ??
          invoice.bookingReference,
      };

      setWorkflow(
        (current) => ({
          ...current,
          invoice: savedInvoice,
          stage: "INVOICE",
        })
      );

      setModal({
        type: "success",
        title: "Invoice Generated",
        message:
          "Invoice generated. Print or save the guest copy, then continue to room locking.",
        onCloseAction: () => {
          setCurrentPage(
            "workflow"
          );
        },
      });
    } catch (error) {
      console.error(
        "Invoice API error:",
        error
      );

      setModal({
        type: "error",
        title: "Invoice Generation Failed",
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate invoice.",
      });
    }
  };

  /* =========================================
     ROOM LOCK
  ========================================= */
/* =========================================
   ROOM LOCK
========================================= */

const handleRoomLockedContinue = async (
  data: RoomLockedData
) => {
  if (!loggedInUser) {
    setModal({
      type: "error",
      title: "Session Expired",
      message: "Please login again.",
    });
    return;
  }

  if (!workflow.booking?.id) {
    setModal({
      type: "error",
      title: "Booking ID Missing",
      message:
        "Booking ID is required for room locking.",
    });
    return;
  }

  if (!workflow.invoice) {
    setModal({
      type: "error",
      title: "Invoice Missing",
      message:
        "Invoice information is required before room locking.",
    });
    return;
  }

  if (!workflow.paymentId) {
    setModal({
      type: "error",
      title: "Payment ID Missing",
      message:
        "Payment information is missing. Please verify the payment before locking the room.",
    });
    return;
  }

  if (
    !Array.isArray(
      data.accommodations
    ) ||
    data.accommodations.length === 0
  ) {
    setModal({
      type: "warning",
      title: "Accommodation Missing",
      message:
        "No accepted room or bed is available for locking.",
    });
    return;
  }

  try {
    const response = await apiFetch(
      "http://localhost:5000/api/allotments/lock",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          booking_id:
            workflow.booking.id,

          allotted_by:
            loggedInUser.id,

          remarks:
            `Room locked after approval, payment and invoice. Invoice: ${workflow.invoice.invoiceNumber}`,
        }),
      }
    );

    const result =
      await response.json();

    if (!response.ok) {
      throw new Error(
        result.message ||
          "Unable to lock the room."
      );
    }

    setWorkflow(
      (current) => ({
        ...current,

        roomLocked:
          data,

        stage:
          "CHECK_IN",
      })
    );

    setModal({
      type: "success",
      title:
        "Room Locked Successfully",
      message:
        result.message ||
        "The selected room/bed has been physically locked successfully. Proceed to Check-In.",
      onCloseAction: () => {
        setCurrentPage(
          "check-in"
        );
      },
    });

  } catch (error) {
    console.error(
      "Room Lock API error:",
      error
    );

    setModal({
      type: "error",
      title:
        "Room Lock Failed",
      message:
        error instanceof Error
          ? error.message
          : "Unable to lock the selected room/bed.",
    });
  }
};

  /* =========================================
     PRE CHECK-OUT
  ========================================= */

  const handlePreCheckOutContinue = (
    data: PreCheckOutData
  ) => {

    setWorkflow(
      (current) => ({
        ...current,
        preCheckOut:
          data,
        stage:
          "REFUND_CALCULATION",
      })
    );

  };

  /* =========================================
     REFUND CALCULATION
  ========================================= */

  const handleRefundCalculationContinue = (
    data: RefundCalculationData
  ) => {

    setWorkflow(
      (current) => ({
        ...current,
        refundCalculation:
          data,
        stage:
          "REFUND_MEMO",
      })
    );

  };

  /* =========================================
     REFUND MEMO
  ========================================= */

  const handleRefundMemoContinue = (
    data: RefundMemoData
  ) => {

    setWorkflow(
      (current) => ({
        ...current,
        refundMemo:
          data,
        stage:
          "WHATSAPP_FEEDBACK",
      })
    );

  };

  /* =========================================
     FEEDBACK
  ========================================= */

  const handleFeedbackComplete = (
    data: WhatsAppFeedbackData
  ) => {

    setWorkflow(
      (current) => ({
        ...current,
        feedback:
          data,
      })
    );

    setModal({
      type: "success",
      title:
        "Workflow Completed",
      message:
        "The booking lifecycle has been completed successfully.",
      onCloseAction: () => {
        resetWorkflow();
        setCurrentPage(
          "dashboard"
        );
      },
    });

  };

  /* =========================================
     NORMAL NAVIGATION
  ========================================= */

  const handleAvailability = () => {
    setCurrentPage(
      "availability"
    );
  };

  const handleCheckIn = () => {
    setCurrentPage(
      "check-in"
    );
  };

  const handleCheckOut = () => {
    setCurrentPage(
      "check-out"
    );
  };

  const handleHousekeeping = () => {
    setCurrentPage(
      "housekeeping"
    );
  };

  const handleApprovals = () => {
    setCurrentPage(
      "approvals"
    );
  };

  const handleLostAndFound = () => {
    setCurrentPage(
      "lost-and-found"
    );
  };

  const handleBackToDashboard = () => {
    setCurrentPage(
      "dashboard"
    );
  };

  /* =========================================
     MODAL
  ========================================= */

  const renderModal = () => {

    if (!modal) {
      return null;
    }

    return (
      <AppModal
        type={
          modal.type
        }

        title={
          modal.title
        }

        message={
          modal.message
        }

        confirmText="OK"

        showCancel={
          false
        }

        onClose={
          closeModal
        }
      />
    );

  };

  /* =========================================
     SPLASH
  ========================================= */

  if (showSplash) {

    return (
      <main className="modern-splash-screen">

        <div className="splash-background-orb splash-orb-one" />

        <div className="splash-background-orb splash-orb-two" />

        <div className="splash-background-orb splash-orb-three" />

        <div className="modern-splash-card">

          <div className="splash-top-line">
            <span />
            <span />
            <span />
          </div>

          <div className="modern-splash-content">

            <div className="modern-splash-emblem">
              <div className="modern-splash-emblem-inner">
                ESM
              </div>
            </div>

            <div className="modern-splash-heading">

              <span className="splash-overline">
                GOVERNMENT REST HOUSE
              </span>

              <h1>
                ESM REST HOUSE
              </h1>

              <p>
                Booking &amp; Management System
              </p>

            </div>

            <div className="splash-divider">
              <span />
              <b>•</b>
              <span />
            </div>

            <div className="splash-location">

              <span className="location-dot" />

              <span>
                PUNE
              </span>

            </div>

            <div className="splash-loading">

              <div className="splash-loading-track">
                <div className="splash-loading-fill" />
              </div>

              <div className="splash-loading-text">

                <span>
                  SECURE SYSTEM
                </span>

                <span>
                  INITIALIZING
                </span>

              </div>

            </div>

          </div>

          <div className="modern-splash-footer">

            <span>
              ESM Rest House • Pune
            </span>

            <span>
              v0.1.0
            </span>

          </div>

        </div>

      </main>
    );

  }

  /* =========================================
     LOGIN
  ========================================= */

  if (!loggedInUser) {
    if (isRestoringSession) {
      return (
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
          }}
        >
          <p>Restoring your secure session...</p>
        </main>
      );
    }

    return (
      <Login
        onLogin={
          handleLogin
        }
      />
    );

  }

  /* =========================================
     CREATE USER
  ========================================= */

  if (
    loggedInUser.role ===
      "ADMIN" &&
    currentPage ===
      "create-user"
  ) {

    return (
      <>
        <CreateUser
          users={
            users
          }

          onCreateUser={
            handleCreateUser
          }

          onDeleteUser={
            handleDeleteUser
          }

          currentUserId={
            loggedInUser.id
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     BOOKING
  ========================================= */

  if (
    currentPage ===
    "booking"
  ) {

    const bookingCategory =
      explicitAuthoritySelection
        ? getAuthorityBookingCategory(
            explicitAuthoritySelection.categoryName
          )
        : getAccommodationCategory(
            loggedInUser.role
          );

    return (
      <>
        <Booking
          category={
            bookingCategory
          }

          initialBooking={
            workflow.booking
          }

          officerName={
            loggedInUser.name
          }

          userId={
            loggedInUser.id
          }

          onBack={
            handleBackToDashboard
          }

          onContinue={
            handleBookingContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     WORKFLOW AVAILABILITY
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "AVAILABILITY"
  ) {

    return (
      <>
        <Availability
          category={
            explicitAuthoritySelection
              ? getAuthorityBookingCategory(
                  explicitAuthoritySelection.categoryName
                )
              : getAccommodationCategory(
                  loggedInUser.role
                )
          }

          role={
            loggedInUser.role
          }

          booking={
            workflow.booking
          }

          initialSelections={
            workflow.availabilitySelections
          }

          authoritySelection={
            explicitAuthoritySelection
          }

          onSelectionsChange={
            handleAvailabilitySelectionsChange
          }

          onConfirmBooking={
            handleConfirmAcceptance
          }

          onBack={() => {
            setCurrentPage(
              "booking"
            );
          }}
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     GUEST TYPE
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "GUEST_TYPE"
  ) {

    if (!workflow.booking) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    return (
      <>
        <GuestType
          officerName={
            loggedInUser.name
          }

          onBack={() => {
            void handleBookingStepBack(
              "AVAILABILITY",
              "AVAILABILITY"
            );
          }}

          onContinue={
            handleGuestTypeContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     RATE
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "RATE"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const firstAcceptedAccommodation =
      workflow.acceptedAccommodation[0];
    const rateCategory = firstAcceptedAccommodation
      ? getAcceptedAccommodationCategory(
          firstAcceptedAccommodation
        )
      : getRateAccommodationCategory(
          workflow.booking.category
        );

    const numberOfRooms = new Set(
      workflow.acceptedAccommodation
        .filter((item) => !item.bedId)
        .map((item) => item.roomId)
    ).size;

    const numberOfBeds = new Set(
      workflow.acceptedAccommodation
        .filter((item) => Boolean(item.bedId))
        .map((item) => item.bedId)
    ).size;

    /*
     * Booking.tsx currently does not
     * contain separate additional-member
     * billing classifications.
     *
     * Therefore these remain zero here
     * instead of inventing a classification.
     */
    const additionalRetiredMembers = 0;

    const additionalOtherRelations = 0;

    return (
      <>
        <Rate
          officerName={
            loggedInUser.name
          }

          guestType={
            workflow.guestType
          }

          accommodationCategory={
            rateCategory
          }

          checkIn={
            workflow.booking.checkIn
          }

          checkOut={
            workflow.booking.checkOut
          }

          numberOfRooms={
            numberOfRooms
          }

          numberOfBeds={
            numberOfBeds
          }

          additionalRetiredMembers={
            additionalRetiredMembers
          }

          additionalOtherRelations={
            additionalOtherRelations
          }

          onBack={() => {
            void handleBookingStepBack(
              "GUEST_TYPE",
              "GUEST_TYPE"
            );
          }}

          onContinue={
            handleRateContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     BOOKING CONFIRMATION
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "BOOKING_CONFIRMATION"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.rateSelection ||
      !workflow.rateResult ||
      !workflow.bookingConfirmation
    ) {

      if (
        workflow.booking &&
        workflow.guestType &&
        workflow.rateSelection &&
        workflow.rateResult
      ) {

        const confirmation:
          BookingConfirmationData = {

          bookingType:
            workflow.booking.bookingType,

          category:
            String(
              workflow.rateSelection
                .accommodationCategory
            ),

          serviceman:
            workflow.booking.serviceman,

          guests:
            workflow.booking.guests,

          checkIn:
            workflow.booking.checkIn,

          checkOut:
            workflow.booking.checkOut,

          acceptedAccommodation:
            workflow.acceptedAccommodation,

          guestType:
            workflow.guestType,

          rateSelection:
            workflow.rateSelection,

          rateResult:
            workflow.rateResult,

        };

        setWorkflow(
          (current) => ({
            ...current,
            bookingConfirmation:
              confirmation,
          })
        );

      }

    }

    const confirmation =
      workflow.bookingConfirmation;

    if (!confirmation) {
      return null;
    }

    return (
      <>
        <BookingConfirmation
          officerName={
            loggedInUser.name
          }

          booking={
            confirmation
          }

          onBack={() => {
            void handleBookingStepBack(
              "RATE",
              "RATE"
            );
          }}

          onConfirm={
            handleBookingConfirmation
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     BOOKING APPROVAL
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "BOOKING_APPROVAL"
  ) {

    if (
      !workflow.booking ||
      !workflow.bookingConfirmation ||
      !workflow.guestType ||
      !workflow.rateResult ||
      !workflow.rateSelection
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const approvalAccommodation:
      ApprovalAccommodation[] =
      workflow.acceptedAccommodation.map(
        (item) => ({
          roomId:
            item.roomId,

          roomName:
            item.roomName,

          category:
            getAcceptedAccommodationCategory(
              item
            ),

          bedId:
            item.bedId,

          bedNumber:
            item.bedNumber,

          guestId:
            item.guestId,

          guestName:
            item.guestName,
        })
      );

    const approvalData:
      BookingApprovalData = {

      bookingId:
        workflow.booking.id,

      /*
       * BookingDraft currently stores the
       * database ID but not booking_reference.
       * Therefore no fake reference is generated.
       */

      bookingType:
        workflow.booking.bookingType,

      guestType:
        workflow.guestType,

      category:
        String(
          workflow.rateSelection
            .accommodationCategory
        ),

      serviceman:
        workflow.booking.serviceman,

      guests:
        workflow.booking.guests.map(
          (guest) => ({
            id:
              guest.id,

            name:
              guest.name,

            gender:
              guest.gender,

            actualGender:
              guest.actualGender,

            relationship:
              guest.relationship,

            mobile:
              guest.mobile,

            relationshipProofType:
              guest.relationshipProofType,

            relationshipProofNumber:
              guest.relationshipProofNumber,
          })
        ),

      checkIn:
        workflow.booking.checkIn,

      checkOut:
        workflow.booking.checkOut,

      acceptedAccommodation:
        approvalAccommodation,

      accommodationAmount:
        workflow.rateResult
          .accommodationAmount,

      additionalMemberAmount:
        workflow.rateResult
          .additionalMemberAmount,

      totalAmount:
        workflow.rateResult
          .totalAmount,

    };

    return (
      <>
        <BookingApproval
          officerName={
            loggedInUser.name
          }

          booking={
            approvalData
          }

          alreadyApproved={
            workflow.approvalDecision === "APPROVED"
          }

          onBack={() => {
            if (workflow.approvalDecision === "APPROVED") {
              setCurrentPage("booking");
            } else {
              void handleBookingStepBack(
                "BOOKING_CONFIRMATION",
                "BOOKING_CONFIRMATION"
              );
            }
          }}

          onDecision={
            handleApprovalDecision
          }

          onContinueToPayment={() => {
            setWorkflow((current) => ({
              ...current,
              stage: "PAYMENT",
            }));
          }}
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     PAYMENT
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "PAYMENT"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.rateResult
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    return (
      <>
        <Payment
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            workflow.invoice?.bookingReference
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          guestType={
            workflow.guestType
          }

          approvedAmount={
            workflow.rateResult
              .totalAmount
          }

          onBack={() => {
            setWorkflow(
              (current) => ({
                ...current,
                stage:
                  "BOOKING_APPROVAL",
              })
            );
          }}

          onContinue={
            handlePaymentContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     INVOICE
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "INVOICE"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.rateResult ||
      !workflow.payment
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    return (
      <>
        <Invoice
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          guestType={
            workflow.guestType
          }

          totalAmount={
            workflow.rateResult
              .totalAmount
          }

          paidAmount={
            workflow.payment
              .amountReceived
          }

          paymentMethod={
            workflow.payment
              .paymentMethod
          }

          transactionNumber={
            workflow.payment
              .transactionNumber
          }

          paymentDate={
            workflow.payment
              .paymentDate
          }

          checkIn={
            workflow.booking.checkIn
          }

          checkOut={
            workflow.booking.checkOut
          }

          accommodations={
            workflow.acceptedAccommodation.map((item) => ({
              roomName: item.roomName,
              bedNumber: item.bedNumber,
              guestName: item.guestName,
            }))
          }

          generatedInvoice={
            workflow.invoice
          }

          onBack={() => {
            setWorkflow(
              (current) => ({
                ...current,
                stage:
                  "PAYMENT",
              })
            );
          }}

          onContinue={
            handleInvoiceContinue
          }

          onContinueToRoomLock={() => {
            setWorkflow((current) => ({
              ...current,
              stage: "ROOM_LOCKED",
            }));
          }}
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     ROOM LOCKED
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "ROOM_LOCKED"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.invoice ||
      !workflow.rateResult
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    const lockedAccommodation:
      LockedAccommodation[] =
      workflow.acceptedAccommodation.map(
        (item) => ({
          roomId:
            item.roomId,

          roomName:
            item.roomName,

          bedId:
            item.bedId,

          bedNumber:
            item.bedNumber,

          guestName:
            item.guestName,
        })
      );

    return (
      <>
        <RoomLocked
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          guestType={
            workflow.guestType
          }

          invoiceNumber={
            workflow.invoice
              .invoiceNumber
          }

          invoiceType={
            workflow.invoice
              .invoiceType
          }

          totalAmount={
            workflow.rateResult
              .totalAmount
          }

          paidAmount={
            workflow.payment
              ?.amountReceived ??
            workflow.invoice
              .paidAmount
          }

          accommodations={
            lockedAccommodation
          }

          onBack={() => {
            setWorkflow(
              (current) => ({
                ...current,
                stage:
                  "INVOICE",
              })
            );
          }}

          onContinue={
            handleRoomLockedContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     PRE CHECK-OUT
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "PRE_CHECK_OUT"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.roomLocked ||
      !workflow.rateResult
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    const preCheckOutAccommodation:
      PreCheckOutAccommodation[] =
      workflow.acceptedAccommodation.map(
        (item) => ({
          roomId:
            item.roomId,

          roomName:
            item.roomName,

          bedId:
            item.bedId,

          bedNumber:
            item.bedNumber,
        })
      );

    return (
      <>
        <PreCheckOut
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestId={
            primaryGuest?.id
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          guestType={
            workflow.guestType
          }

          accommodations={
            preCheckOutAccommodation
          }

          scheduledCheckOutDate={
            workflow.booking
              .checkOut
              .split("T")[0]
          }

          totalAmount={
            workflow.rateResult
              .totalAmount
          }

          paidAmount={
            workflow.payment
              ?.amountReceived ??
            0
          }

          onBack={() => {
            setCurrentPage(
              "check-out"
            );
          }}

          onContinue={
            handlePreCheckOutContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     REFUND CALCULATION
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "REFUND_CALCULATION"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.preCheckOut ||
      !workflow.rateResult
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    const refundAccommodation:
      RefundCalculationAccommodation[] =
      workflow.acceptedAccommodation.map(
        (item) => ({
          roomId:
            item.roomId,

          roomName:
            item.roomName,

          bedId:
            item.bedId,

          bedNumber:
            item.bedNumber,
        })
      );

    return (
      <>
        <RefundCalculation
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestId={
            primaryGuest?.id
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          guestType={
            workflow.guestType
          }

          accommodations={
            refundAccommodation
          }

          scheduledCheckOutDate={
            workflow.preCheckOut
              .scheduledCheckOutDate
          }

          preCheckOutDate={
            workflow.preCheckOut
              .preCheckOutDate
          }

          totalAmount={
            workflow.rateResult
              .totalAmount
          }

          paidAmount={
            workflow.preCheckOut
              .paidAmount
          }

          reason={
            workflow.preCheckOut
              .reason
          }

          onBack={() => {
            setWorkflow(
              (current) => ({
                ...current,
                stage:
                  "PRE_CHECK_OUT",
              })
            );
          }}

          onContinue={
            handleRefundCalculationContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     REFUND MEMO
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "REFUND_MEMO"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType ||
      !workflow.refundCalculation
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    const refundMemoAccommodation:
      RefundMemoAccommodation[] =
      workflow.acceptedAccommodation.map(
        (item) => ({
          roomId:
            item.roomId,

          roomName:
            item.roomName,

          bedId:
            item.bedId,

          bedNumber:
            item.bedNumber,
        })
      );

    return (
      <>
        <RefundMemo
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestId={
            primaryGuest?.id
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          bookingPersonName={
            workflow.booking.serviceman.name
          }

          bookingPersonAddress={
            workflow.booking.serviceman.address
          }

          guestType={
            workflow.guestType
          }

          accommodations={
            refundMemoAccommodation
          }

          scheduledCheckOutDate={
            workflow.refundCalculation
              .scheduledCheckOutDate
          }

          preCheckOutDate={
            workflow.refundCalculation
              .preCheckOutDate
          }

          totalAmount={
            workflow.refundCalculation
              .totalAmount
          }

          paidAmount={
            workflow.refundCalculation
              .paidAmount
          }

          adjustmentAmount={
            workflow.refundCalculation
              .adjustmentAmount
          }

          refundableAmount={
            workflow.refundCalculation
              .refundableAmount
          }

          retainedAmount={
            workflow.refundCalculation
              .retainedAmount
          }

          calculationRemarks={
            workflow.refundCalculation
              .remarks
          }

          onBack={() => {
            setWorkflow(
              (current) => ({
                ...current,
                stage:
                  "REFUND_CALCULATION",
              })
            );
          }}

          onContinue={
            handleRefundMemoContinue
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     WHATSAPP FEEDBACK
  ========================================= */

  if (
    currentPage ===
      "workflow" &&
    workflow.stage ===
      "WHATSAPP_FEEDBACK"
  ) {

    if (
      !workflow.booking ||
      !workflow.guestType
    ) {

      resetWorkflow();

      setCurrentPage(
        "dashboard"
      );

      return null;

    }

    const primaryGuest =
      workflow.booking.guests[0];

    return (
      <>
        <WhatsAppFeedback
          officerName={
            loggedInUser.name
          }

          bookingId={
            workflow.booking.id
          }

          bookingReference={
            undefined
          }

          guestId={
            primaryGuest?.id
          }

          guestName={
            primaryGuest?.name ||
            workflow.booking
              .serviceman.name
          }

          mobile={
            primaryGuest?.mobile
          }

          guestType={
            workflow.guestType
          }

          refundMemoNumber={
            workflow.refundMemo
              ?.memoNumber
          }

          refundAmount={
            workflow.refundMemo
              ?.refundableAmount ??
            0
          }

          onBack={() => {

            if (
              workflow.refundMemo
            ) {

              setWorkflow(
                (current) => ({
                  ...current,
                  stage:
                    "REFUND_MEMO",
                })
              );

            } else {

              setCurrentPage(
                "check-out"
              );

            }

          }}

          onComplete={
            handleFeedbackComplete
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     CHECK-IN
  ========================================= */

  if (
    currentPage ===
    "check-in"
  ) {

    return (
      <>
        <CheckIn
          userId={
            loggedInUser.id
          }

          userName={
            loggedInUser.name
          }

          userRole={
            loggedInUser.role
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     CHECK-OUT
  ========================================= */

  if (
    currentPage ===
    "check-out"
  ) {

    return (
      <>
        <CheckOut
          userId={
            loggedInUser.id
          }

          userName={
            loggedInUser.name
          }

          userRole={
            loggedInUser.role
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     DIRECT AVAILABILITY
  ========================================= */

  if (currentPage === "customize-rates") {
    if (loggedInUser.role !== "ADMIN") {
      return (
        <main className="customize-rates-screen">
          <section className="customize-rates-empty">
            <strong>Administrator access required</strong>
            <button type="button" onClick={handleBackToDashboard}>
              ← Dashboard
            </button>
          </section>
        </main>
      );
    }

    return (
      <>
        <CustomizeRates onBack={handleBackToDashboard} />
        {renderModal()}
      </>
    );
  }

  if (
    currentPage ===
    "availability"
  ) {

    return (
      <>
        <Availability
          category={
            getAccommodationCategory(
              loggedInUser.role
            )
          }

          role={
            loggedInUser.role
          }

          booking={
            null
          }

          authoritySelection={
            explicitAuthoritySelection
          }

          onConfirmBooking={
            () => {}
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     HOUSEKEEPING
  ========================================= */

  if (
    loggedInUser.role ===
      "RECEPTIONIST" &&
    currentPage ===
      "housekeeping"
  ) {

    return (
      <>
        <Housekeeping
          userId={
            loggedInUser.id
          }

          userName={
            loggedInUser.name
          }

          userRole={
            loggedInUser.role
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     OTHER AUTHORITY ROOMS
  ========================================= */

  if (
    loggedInUser.role ===
      "RECEPTIONIST" &&
    currentPage ===
      "otherAuthorityRooms"
  ) {

    return (
      <>
        <OtherAuthorityRooms
          role={
            loggedInUser.role
          }

          onBack={
            handleBackToDashboard
          }

          onContinue={
            handleExplicitAuthoritySelection
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     APPROVALS
  ========================================= */

  if (
    (
      loggedInUser.role ===
        "DY_DIRECTOR" ||
      loggedInUser.role ===
        "SUPERINTENDENT" ||
      loggedInUser.role ===
        "WELFARE_ORGANISER" ||
      loggedInUser.role ===
        "OLC_REST_HOUSE_MANAGER"
    ) &&
    currentPage ===
      "approvals"
  ) {

    return (
      <>
        <Approval
          user={
            loggedInUser
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  /* =========================================
     LOST & FOUND
  ========================================= */

  if (
    currentPage ===
    "lost-and-found"
  ) {

    return (
      <>
        <LostAndFound
          user={
            loggedInUser
          }

          onBack={
            handleBackToDashboard
          }
        />

        {renderModal()}
      </>
    );

  }

  if (currentPage === "daily-report") {
    return (
      <>
        <DailyReport
          user={loggedInUser}
          onBack={handleBackToDashboard}
        />
        {renderModal()}
      </>
    );
  }

  /* =========================================
     DASHBOARD
  ========================================= */

  return (
    <>
      <Dashboard
        user={
          loggedInUser
        }

        onLogout={
          handleLogout
        }

        onCreateUser={() => {
          setCurrentPage(
            "create-user"
          );
        }}

        onNewBooking={
          handleNewBooking
        }

        onResumeBooking={
          handleResumeBooking
        }

        onAvailability={
          handleAvailability
        }

        onCustomizeRates={() => {
          setCurrentPage("customize-rates");
        }}

        onOpenOtherAuthorityRooms={() => {
          setCurrentPage(
            "otherAuthorityRooms"
          );
        }}

        onCheckIn={
          handleCheckIn
        }

        onCheckOut={
          handleCheckOut
        }

        onHousekeeping={
          handleHousekeeping
        }

        onApprovals={
          handleApprovals
        }

        onLostAndFound={
          handleLostAndFound
        }

        onDailyReport={() => {
          setCurrentPage("daily-report");
        }}
      />

      {renderModal()}
    </>
  );

}

/* =========================================
   LANGUAGE PROVIDER
========================================= */

function App() {

  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );

}

export default App;