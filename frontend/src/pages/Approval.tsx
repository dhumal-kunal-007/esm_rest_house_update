import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import "../App.css";
import BrandLogo from "../components/BrandLogo";
import { apiFetch } from "../api";

import type { User } from "../App";
import { useLanguage } from "../i18n/LanguageContext";

/* =========================================================
   TYPES
========================================================= */

interface ApprovalRecord {
  booking_id: string;
  booking_reference: string;
  booking_type: string;
  booking_date: string;
  check_in_date: string;
  expected_check_out_date: string;
  number_of_guests: number;
  booking_status: string;
  approval_status: string;
  purpose_of_visit: string | null;
  special_requirements: string | null;
  is_emergency: boolean;
  created_at: string;
  total_amount: number;
  service_member_name: string;
  service_number: string;
  service_member_rank: string;
  service_member_address: string;
  service_member_identity_number: string;

  created_by: string;
  created_by_name: string;
  created_by_username: string;

  allotment_id: string;
  room_id: string;
  bed_id: string | null;
  guest_id: string;
  allotted_by: string;
  is_emergency_allotment: boolean;
  allotted_at: string;
  allotment_remarks: string | null;

  room_number: string;
  room_status: string;

  bed_number: number | null;
  bed_status: string | null;

  category_name: string;

  guest_name: string;
  gender: string | null;
  mobile_number: string | null;
  relationship: string | null;
  rank: string | null;

  responsible_role: string;
}

interface ApprovalResponse {
  success: boolean;
  approvals: ApprovalRecord[];
  message?: string;
}

/* =========================================================
   PROPS
========================================================= */

interface ApprovalProps {
  user: User;
  onBack: () => void;
}

/* =========================================================
   COMPONENT
========================================================= */

function Approval({
  user,
  onBack,
}: ApprovalProps) {
  const { language, setLanguage } = useLanguage();

  const isMarathi = language === "mr";

  const tr = (
    english: string,
    marathi: string
  ) => (isMarathi ? marathi : english);

  /* =======================================================
     STATE
  ======================================================= */

  const [approvals, setApprovals] =
    useState<ApprovalRecord[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [selectedBooking, setSelectedBooking] =
    useState<string | null>(null);

  const [actionLoading, setActionLoading] =
    useState(false);

  const [actionType, setActionType] =
    useState<
      "APPROVE" | "REJECT" | null
    >(null);

  const [remarks, setRemarks] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  /* =======================================================
     LOAD PENDING APPROVALS
  ======================================================= */

  const loadApprovals = useCallback(
    async (showRefresh = false) => {
      if (!user?.id) {
        setErrorMessage(
          tr(
            "Logged-in user information is missing.",
            "लॉग-इन केलेल्या वापरकर्त्याची माहिती उपलब्ध नाही."
          )
        );

        setLoading(false);

        return;
      }

      try {
        if (showRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        setErrorMessage("");

        const response = await apiFetch(
          `http://localhost:5000/api/approvals/pending/${user.id}`,
          {
            method: "GET",
            headers: {
              "Content-Type":
                "application/json",
            },
            cache: "no-store",
          }
        );

        const data: ApprovalResponse =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              tr(
                "Unable to load pending approvals.",
                "प्रलंबित मंजुरी लोड करता आल्या नाहीत."
              )
          );
        }

        if (!data.success) {
          throw new Error(
            data.message ||
              tr(
                "Unable to load pending approvals.",
                "प्रलंबित मंजुरी लोड करता आल्या नाहीत."
              )
          );
        }

        setApprovals(
          Array.isArray(data.approvals)
            ? data.approvals
            : []
        );
      } catch (error) {
        console.error(
          "Approval loading error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : tr(
                "Unable to connect to the approval server.",
                "मंजुरी सर्व्हरशी कनेक्ट करता आले नाही."
              )
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user.id, isMarathi]
  );

  /* =======================================================
     INITIAL LOAD
  ======================================================= */

  useEffect(() => {
    // This effect starts the initial async API load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadApprovals();
  }, [loadApprovals]);

  /* =======================================================
     GROUP BOOKINGS
  ======================================================= */

  const groupedBookings =
    useMemo(() => {
      const groups =
        new Map<
          string,
          ApprovalRecord[]
        >();

      approvals.forEach(
        (approval) => {
          const existing =
            groups.get(
              approval.booking_id
            );

          if (existing) {
            existing.push(approval);
          } else {
            groups.set(
              approval.booking_id,
              [approval]
            );
          }
        }
      );

      return Array.from(
        groups.entries()
      ).map(
        ([
          bookingId,
          records,
        ]) => ({
          bookingId,
          booking: records[0],
          records,
        })
      );
    }, [approvals]);

  /* =======================================================
     DATE FORMAT
  ======================================================= */

  const formatDate = (
    value: string
  ) => {
    if (!value) {
      return "-";
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
      isMarathi ? "mr-IN" : "en-IN",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  };

  /* =======================================================
     ROLE LABEL
  ======================================================= */

  const getRoleLabel = (
    role: string
  ) => {
    switch (role) {
      case "SUPERINTENDENT":
        return tr(
          "SUPERINTENDENT",
          "अधीक्षक"
        );

      case "WELFARE_ORGANISER":
        return tr(
          "WELFARE ORGANISER",
          "कल्याण आयोजक"
        );

      case "OLC_REST_HOUSE_MANAGER":
        return tr(
          "OLC REST HOUSE MANAGER",
          "OLC विश्रामगृह व्यवस्थापक"
        );

      case "DY_DIRECTOR":
        return tr(
          "DEPUTY DIRECTOR",
          "उपसंचालक"
        );

      default:
        return role;
    }
  };

  /* =======================================================
     OPEN APPROVAL ACTION
  ======================================================= */

  const openAction = (
    bookingId: string,
    type:
      | "APPROVE"
      | "REJECT"
  ) => {
    setSelectedBooking(
      bookingId
    );

    setActionType(type);

    setRemarks("");

    setSuccessMessage("");
  };

  /* =======================================================
     CLOSE ACTION
  ======================================================= */

  const closeAction = () => {
    if (actionLoading) {
      return;
    }

    setSelectedBooking(null);
    setActionType(null);
    setRemarks("");
  };

  /* =======================================================
     EXECUTE APPROVAL / REJECTION
  ======================================================= */

  const executeAction =
    async () => {
      if (
        !selectedBooking ||
        !actionType
      ) {
        return;
      }

      if (
        actionType === "REJECT" &&
        !remarks.trim()
      ) {
        setErrorMessage(
          tr(
            "Remarks are required when rejecting a booking.",
            "बुकिंग नाकारताना शेरा आवश्यक आहे."
          )
        );

        return;
      }

      try {
        setActionLoading(true);
        setErrorMessage("");

        const endpoint =
          actionType === "APPROVE"
            ? "approve"
            : "reject";

        const response = await apiFetch(
          `http://localhost:5000/api/approvals/${selectedBooking}/${endpoint}`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              approver_id: user.id,
              remarks:
                remarks.trim() ||
                null,
            }),
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.message ||
              tr(
                `Unable to ${endpoint} the booking.`,
                "बुकिंगची प्रक्रिया पूर्ण करता आली नाही."
              )
          );
        }

        if (!data.success) {
          throw new Error(
            data.message ||
              tr(
                `Unable to ${endpoint} the booking.`,
                "बुकिंगची प्रक्रिया पूर्ण करता आली नाही."
              )
          );
        }

        setSelectedBooking(null);
        setActionType(null);
        setRemarks("");

        setSuccessMessage(
          actionType === "APPROVE"
            ? tr(
                "Booking approved successfully.",
                "बुकिंग यशस्वीरित्या मंजूर झाले."
              )
            : tr(
                "Booking rejected successfully.",
                "बुकिंग यशस्वीरित्या नाकारले गेले."
              )
        );

        await loadApprovals(true);
      } catch (error) {
        console.error(
          "Approval action error:",
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : tr(
                "Unable to complete the approval action.",
                "मंजुरीची प्रक्रिया पूर्ण करता आली नाही."
              )
        );
      } finally {
        setActionLoading(false);
      }
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="approval-screen">
      {/* HEADER */}

      <header className="modern-dashboard-header">
        <div className="modern-brand">
          <BrandLogo className="modern-brand-mark" />

          <div className="modern-brand-text">
            <h1>ESM REST HOUSE</h1>

            <p>
              {tr(
                "Booking & Management System",
                "बुकिंग आणि व्यवस्थापन प्रणाली"
              )}
            </p>
          </div>
        </div>

        <div className="modern-header-right">
          <div className="modern-header-date">
            <span>
              {tr("TODAY", "आज")}
            </span>

            <strong>
              {new Date().toLocaleDateString(
                isMarathi
                  ? "mr-IN"
                  : "en-IN",
                {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                }
              )}
            </strong>
          </div>

          <div className="modern-user">
            <div className="modern-user-avatar">
              {user.name
                ?.charAt(0)
                .toUpperCase() ||
                "U"}
            </div>

            <div className="modern-user-details">
              <strong>
                {user.name}
              </strong>

              <span>
                {getRoleLabel(
                  user.role
                )}
              </span>
            </div>
          </div>

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
            className="modern-logout"
            onClick={onBack}
          >
            {tr("Back", "मागे")}
          </button>
        </div>
      </header>

      {/* CONTENT */}

      <section className="approval-content">
        {/* PAGE INTRO */}

        <section className="approval-welcome">
          <div>
            <span className="approval-eyebrow">
              {tr(
                "APPROVAL MANAGEMENT",
                "मंजुरी व्यवस्थापन"
              )}
            </span>

            <h2>
              {tr(
                "Pending Approvals",
                "प्रलंबित मंजुरी"
              )}
            </h2>

            <p>
              {tr(
                "Review room booking requests assigned to your authority.",
                "आपल्या अधिकारक्षेत्राला सोपवलेल्या खोली बुकिंग विनंत्यांचे परीक्षण करा."
              )}
            </p>
          </div>

          <div className="approval-welcome-meta">
            <strong>
              {getRoleLabel(
                user.role
              )}
            </strong>

            <span>
              {tr(
                "Approval Authority",
                "मंजुरी प्राधिकरण"
              )}
            </span>
          </div>
        </section>

        {/* MESSAGES */}

        {errorMessage && (
          <div className="approval-message approval-error">
            <div>
              <strong>
                {tr(
                  "Approval Centre Error",
                  "मंजुरी केंद्र त्रुटी"
                )}
              </strong>

              <span>
                {errorMessage}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                loadApprovals()
              }
            >
              {tr(
                "Try Again",
                "पुन्हा प्रयत्न करा"
              )}
            </button>
          </div>
        )}

        {successMessage && (
          <div className="approval-message approval-success">
            <div>
              <strong>
                {tr(
                  "Action Completed",
                  "कृती पूर्ण झाली"
                )}
              </strong>

              <span>
                {successMessage}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setSuccessMessage("")
              }
            >
              {tr(
                "Dismiss",
                "बंद करा"
              )}
            </button>
          </div>
        )}

        {/* APPROVAL CENTRE */}

        <section className="approval-panel">
          <div className="approval-panel-header">
            <div>
              <span className="approval-section-eyebrow">
                {tr(
                  "WORKFLOW",
                  "कार्यप्रवाह"
                )}
              </span>

              <h3>
                {tr(
                  "Approval Centre",
                  "मंजुरी केंद्र"
                )}
              </h3>

              <p>
                {loading
                  ? tr(
                      "Loading pending approval records...",
                      "प्रलंबित मंजुरी नोंदी लोड होत आहेत..."
                    )
                  : isMarathi
                    ? `${groupedBookings.length} प्रलंबित बुकिंग आपल्या निर्णयाची प्रतीक्षा करत आहेत.`
                    : `${groupedBookings.length} pending booking${
                        groupedBookings.length ===
                        1
                          ? ""
                          : "s"
                      } awaiting your decision.`}
              </p>
            </div>

            <button
              type="button"
              className="approval-refresh-button"
              onClick={() =>
                loadApprovals(true)
              }
              disabled={
                loading ||
                refreshing
              }
            >
              {refreshing
                ? tr(
                    "Refreshing...",
                    "रिफ्रेश होत आहे..."
                  )
                : tr(
                    "Refresh",
                    "रिफ्रेश"
                  )}
            </button>
          </div>

          {/* LOADING */}

          {loading && (
            <div className="approval-empty-state">
              <div className="approval-spinner" />

              <strong>
                {tr(
                  "Loading Pending Approvals",
                  "प्रलंबित मंजुरी लोड होत आहेत"
                )}
              </strong>

              <span>
                {tr(
                  "Connecting to PostgreSQL...",
                  "PostgreSQL शी कनेक्ट होत आहे..."
                )}
              </span>
            </div>
          )}

          {/* NO RECORDS */}

          {!loading &&
            !errorMessage &&
            groupedBookings.length ===
              0 && (
              <div className="approval-empty-state">
                <div className="approval-empty-icon">
                  ✓
                </div>

                <strong>
                  {tr(
                    "No Pending Approvals",
                    "प्रलंबित मंजुरी नाहीत"
                  )}
                </strong>

                <span>
                  {tr(
                    "There are currently no room bookings waiting for your approval.",
                    "सध्या आपल्या मंजुरीच्या प्रतीक्षेत कोणतेही खोली बुकिंग नाही."
                  )}
                </span>
              </div>
            )}

          {/* BOOKINGS */}

          {!loading &&
            groupedBookings.length >
              0 && (
              <div className="approval-list">
                {groupedBookings.map(
                  ({
                    bookingId,
                    booking,
                    records,
                  }) => (
                    <article
                      key={bookingId}
                      className="approval-card"
                    >
                      {/* CARD HEADER */}

                      <div className="approval-card-header">
                        <div>
                          <span className="approval-reference">
                            {
                              booking.booking_reference
                            }
                          </span>

                          <h4>
                            {
                              booking.guest_name
                            }
                          </h4>

                          <p>
                            {tr(
                              "Created by",
                              "तयार करणारे"
                            )}{" "}
                            <strong>
                              {
                                booking.created_by_name
                              }
                            </strong>
                          </p>
                        </div>

                        <div className="approval-card-status">
                          <span className="approval-status-badge">
                            {tr(
                              "PENDING APPROVAL",
                              "मंजुरी प्रलंबित"
                            )}
                          </span>

                          {booking.is_emergency && (
                            <span className="approval-emergency-badge">
                              {tr(
                                "EMERGENCY",
                                "तातडीचे"
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* DETAILS */}

                      <div className="approval-detail-grid">
                        <div className="approval-detail-box">
                          <span>
                            {tr(
                              "BOOKING TYPE",
                              "बुकिंग प्रकार"
                            )}
                          </span>

                          <strong>
                            {booking.booking_type}
                          </strong>
                        </div>

                        <div className="approval-detail-box">
                          <span>
                            {tr(
                              "CHECK-IN",
                              "चेक-इन"
                            )}
                          </span>

                          <strong>
                            {formatDate(
                              booking.check_in_date
                            )}
                          </strong>
                        </div>

                        <div className="approval-detail-box">
                          <span>
                            {tr(
                              "CHECK-OUT",
                              "चेक-आउट"
                            )}
                          </span>

                          <strong>
                            {formatDate(
                              booking.expected_check_out_date
                            )}
                          </strong>
                        </div>

                        <div className="approval-detail-box">
                          <span>
                            {tr(
                              "GUESTS",
                              "अतिथी"
                            )}
                          </span>

                          <strong>
                            {
                              booking.number_of_guests
                            }
                          </strong>
                        </div>
                        <div className="approval-detail-box">
                          <span>
                            {tr(
                              "APPROVED RATE TOTAL",
                              "मंजूर दराची एकूण रक्कम"
                            )}
                          </span>
                          <strong>
                            ₹
                            {Number(
                              booking.total_amount || 0
                            ).toLocaleString("en-IN")}
                          </strong>
                        </div>
                      </div>

                      {/* ROOM / BED INFORMATION */}

                      <div className="approval-room-section">
                        <div className="approval-room-heading">
                          <div>
                            <span>
                              {tr(
                                "ACCEPTED ACCOMMODATION",
                                "स्वीकृत निवास"
                              )}
                            </span>

                            <strong>
                              {
                                booking.category_name
                              }
                            </strong>
                          </div>

                          <span className="approval-responsible-role">
                            {getRoleLabel(
                              booking.responsible_role
                            )}
                          </span>
                        </div>

                        <div className="approval-room-list">
                          {records.map(
                            (record) => (
                              <div
                                key={
                                  record.allotment_id
                                }
                                className="approval-room-row"
                              >
                                <div>
                                  <strong>
                                    {tr(
                                      "Room",
                                      "खोली"
                                    )}{" "}
                                    {
                                      record.room_number
                                    }
                                  </strong>

                                  <span>
                                    {tr(
                                      "Bed",
                                      "बेड"
                                    )}{" "}
                                    {
                                      record.bed_number
                                    }
                                  </span>
                                </div>

                                <div>
                                  <strong>
                                    {
                                      record.guest_name
                                    }
                                  </strong>

                                  <span>
                                    {
                                      record.mobile_number ||
                                      tr(
                                        "Mobile not provided",
                                        "मोबाईल क्रमांक उपलब्ध नाही"
                                      )
                                    }
                                  </span>
                                </div>

                                <span className="approval-room-status">
                                  {tr(
                                    "ALLOTTED",
                                    "अलॉट केले"
                                  )}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      {/* PURPOSE */}

                      {booking.purpose_of_visit && (
                        <div className="approval-purpose">
                          <span>
                            {tr(
                              "PURPOSE OF VISIT",
                              "भेटीचा उद्देश"
                            )}
                          </span>

                          <p>
                            {
                              booking.purpose_of_visit
                            }
                          </p>
                        </div>
                      )}

                      {/* ACTIONS */}

                      <div className="approval-card-actions">
                        <button
                          type="button"
                          className="approval-reject-button"
                          onClick={() =>
                            openAction(
                              bookingId,
                              "REJECT"
                            )
                          }
                          disabled={
                            actionLoading
                          }
                        >
                          {tr(
                            "Reject",
                            "नकार द्या"
                          )}
                        </button>

                        <button
                          type="button"
                          className="approval-approve-button"
                          onClick={() =>
                            openAction(
                              bookingId,
                              "APPROVE"
                            )
                          }
                          disabled={
                            actionLoading
                          }
                        >
                          {tr(
                            "Approve Booking",
                            "बुकिंग मंजूर करा"
                          )}
                        </button>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
        </section>

        {/* BACK BUTTON */}

        <div className="approval-bottom-actions">
          <button
            type="button"
            className="approval-back-button"
            onClick={onBack}
          >
            {tr(
              "Back to Dashboard",
              "डॅशबोर्डवर परत जा"
            )}
          </button>
        </div>
      </section>

      {/* ACTION MODAL */}

      {actionType &&
        selectedBooking && (
          <div className="approval-modal-overlay">
            <div className="approval-modal">
              <div className="approval-modal-icon">
                {actionType ===
                "APPROVE"
                  ? "✓"
                  : "!"}
              </div>

              <span className="approval-modal-eyebrow">
                {actionType ===
                "APPROVE"
                  ? tr(
                      "APPROVAL CONFIRMATION",
                      "मंजुरी पुष्टीकरण"
                    )
                  : tr(
                      "REJECTION CONFIRMATION",
                      "नकार पुष्टीकरण"
                    )}
              </span>

              <h3>
                {actionType ===
                "APPROVE"
                  ? tr(
                      "Approve this booking?",
                      "हे बुकिंग मंजूर करायचे आहे का?"
                    )
                  : tr(
                      "Reject this booking?",
                      "हे बुकिंग नाकारायचे आहे का?"
                    )}
              </h3>

              <p>
                {actionType ===
                "APPROVE"
                  ? tr(
                      "This booking will be marked as approved and can proceed to check-in.",
                      "हे बुकिंग मंजूर म्हणून नोंदवले जाईल आणि चेक-इनसाठी पुढे जाऊ शकते."
                    )
                  : tr(
                      "This booking will be rejected and its allotted room and bed will be released.",
                      "हे बुकिंग नाकारले जाईल आणि त्याची अलॉट केलेली खोली व बेड रिलीज केले जातील."
                    )}
              </p>

              <div className="approval-modal-booking">
                <span>
                  {tr(
                    "BOOKING",
                    "बुकिंग"
                  )}
                </span>

                <strong>
                  {approvals.find(
                    (item) =>
                      item.booking_id ===
                      selectedBooking
                  )
                    ?.booking_reference ||
                    selectedBooking}
                </strong>
              </div>

              <div className="approval-remarks-field">
                <label>
                  {tr(
                    "Remarks",
                    "शेरा"
                  )}{" "}
                  {actionType ===
                    "REJECT" && (
                    <span>*</span>
                  )}
                </label>

                <textarea
                  value={remarks}
                  onChange={(
                    event
                  ) =>
                    setRemarks(
                      event.target.value
                    )
                  }
                  placeholder={
                    actionType ===
                    "REJECT"
                      ? tr(
                          "Please enter the reason for rejection...",
                          "कृपया नकारण्याचे कारण लिहा..."
                        )
                      : tr(
                          "Optional approval remarks...",
                          "ऐच्छिक मंजुरी शेरा..."
                        )
                  }
                  rows={4}
                  disabled={
                    actionLoading
                  }
                />
              </div>

              <div className="approval-modal-actions">
                <button
                  type="button"
                  className="approval-modal-cancel"
                  onClick={
                    closeAction
                  }
                  disabled={
                    actionLoading
                  }
                >
                  {tr(
                    "Cancel",
                    "रद्द करा"
                  )}
                </button>

                <button
                  type="button"
                  className={
                    actionType ===
                    "APPROVE"
                      ? "approval-modal-confirm approval-modal-confirm-approve"
                      : "approval-modal-confirm approval-modal-confirm-reject"
                  }
                  onClick={
                    executeAction
                  }
                  disabled={
                    actionLoading ||
                    (actionType ===
                      "REJECT" &&
                      !remarks.trim())
                  }
                >
                  {actionLoading
                    ? tr(
                        "Processing...",
                        "प्रक्रिया सुरू आहे..."
                      )
                    : actionType ===
                        "APPROVE"
                      ? tr(
                          "Confirm Approval",
                          "मंजुरीची पुष्टी करा"
                        )
                      : tr(
                          "Confirm Rejection",
                          "नकाराची पुष्टी करा"
                        )}
                </button>
              </div>
            </div>
          </div>
        )}
    </main>
  );
}

export default Approval;