import { useState } from "react";

import "../App.css";
import { useLanguage } from "../i18n/LanguageContext";

/* =========================================
   TYPES
========================================= */

export type RefundMemoType =
  | "CASH_MEMO"
  | "CREDIT_MEMO";

export type RefundMemoGuestType =
  | "ESM"
  | "SERVING"
  | "CIVILIAN"
  | "UNKNOWN";

export interface RefundMemoAccommodation {
  roomId: string;
  roomName: string;
  bedId?: string;
  bedNumber?: number;
}

export interface RefundMemoData {
  bookingId?: string;
  bookingReference?: string;

  guestId?: string;
  guestName: string;
  bookingPersonName: string;
  bookingPersonAddress: string;

  guestType: RefundMemoGuestType;

  accommodations: RefundMemoAccommodation[];

  scheduledCheckOutDate: string;
  preCheckOutDate: string;

  totalAmount: number;
  paidAmount: number;

  adjustmentAmount: number;
  refundableAmount: number;
  retainedAmount: number;

  memoType: RefundMemoType;
  memoNumber: string;
  memoDate: string;

  remarks: string;

  bankDetails: {
    accountHolder: string;
    bankName: string;
    branch: string;
    ifsc: string;
    accountNumber: string;
  };
}

export interface RefundMemoDraft {
  memoType: RefundMemoType;
  memoNumber: string;
  memoDate: string;
  remarks: string;
  bankDetails: RefundMemoData["bankDetails"];
  confirmed: boolean;
}

interface RefundMemoProps {
  officerName: string;

  bookingId?: string;
  bookingReference?: string;

  guestId?: string;
  guestName: string;
  bookingPersonName: string;
  bookingPersonAddress: string;

  guestType: RefundMemoGuestType;

  accommodations: RefundMemoAccommodation[];

  scheduledCheckOutDate: string;
  preCheckOutDate: string;

  totalAmount: number;
  paidAmount: number;

  adjustmentAmount: number;
  refundableAmount: number;
  retainedAmount: number;

  calculationRemarks?: string;

  loading?: boolean;
  continueLabel?: string;
  nextStageDescription?: string;

  draft?: RefundMemoDraft | null;
  onBack: (draft: RefundMemoDraft) => void;

  onContinue: (
    data: RefundMemoData
  ) => void;
}

/* =========================================
   HELPERS
========================================= */

const formatCurrency = (
  amount: number
): string => {
  return `₹${amount.toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 0,
    }
  )}`;
};

const getTodayDate = (): string => {
  const now = new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const createMemoNumber = (bookingId?: string): string => {
  const bookingToken =
    bookingId?.replace(/[^a-z0-9]/gi, "").slice(-12).toUpperCase() ||
    window.crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();

  return `RM-${getTodayDate().replace(/-/g, "")}-${bookingToken}`;
};

/* =========================================
   COMPONENT
========================================= */

function RefundMemo({
  officerName,

  bookingId,
  bookingReference,

  guestId,
  guestName,
  bookingPersonName,
  bookingPersonAddress,

  guestType,

  accommodations,

  scheduledCheckOutDate,
  preCheckOutDate,

  totalAmount,
  paidAmount,

  adjustmentAmount,
  refundableAmount,
  retainedAmount,

  calculationRemarks,
  loading = false,
  continueLabel,
  nextStageDescription,
  draft,

  onBack,
  onContinue,
}: RefundMemoProps) {
  const {
    language,
    setLanguage,
  } = useLanguage();

  const isMarathi =
    language === "mr";

  /* =========================================
     STATE
  ========================================= */

  const [
    memoType,
    setMemoType,
  ] =
    useState<RefundMemoType>(
      draft?.memoType ?? "CASH_MEMO"
    );

  const [
    memoNumber,
  ] = useState(() => draft?.memoNumber ?? createMemoNumber(bookingId));

  const [
    memoDate,
    setMemoDate,
  ] =
    useState(
      draft?.memoDate ?? getTodayDate()
    );

  const [
    remarks,
    setRemarks,
  ] = useState(
    draft?.remarks ??
      (calculationRemarks || "")
  );
  const [bankAccountHolder, setBankAccountHolder] = useState(
    draft?.bankDetails.accountHolder ?? bookingPersonName
  );
  const [bankName, setBankName] = useState(draft?.bankDetails.bankName ?? "");
  const [bankBranch, setBankBranch] = useState(draft?.bankDetails.branch ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(
    draft?.bankDetails.accountNumber ?? ""
  );
  const [bankIfsc, setBankIfsc] = useState(draft?.bankDetails.ifsc ?? "");

  const [
    confirmed,
    setConfirmed,
  ] = useState(draft?.confirmed ?? false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [pdfSaveError, setPdfSaveError] = useState("");

  const handleBack = () => {
    onBack({
      memoType,
      memoNumber,
      memoDate,
      remarks,
      bankDetails: {
        accountHolder: bankAccountHolder,
        bankName,
        branch: bankBranch,
        ifsc: bankIfsc,
        accountNumber: bankAccountNumber,
      },
      confirmed,
    });
  };

  const handleSavePdf = async (): Promise<boolean> => {
    setSavingPdf(true);
    setPdfSaveError("");
    try {
      if (!window.electronAPI) {
        throw new Error(
          "Refund memo PDF auto-save is available only in the ESM Rest House desktop app."
        );
      }
      await window.electronAPI.saveRefundMemoPdf(memoNumber);
      return true;
    } catch (error) {
      console.error("Refund memo PDF save failed:", error);
      setPdfSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save the refund memo PDF."
      );
      return false;
    } finally {
      setSavingPdf(false);
    }
  };

  /* =========================================
     TRANSLATION
  ========================================= */

  const tr = (
    english: string,
    marathi: string
  ) =>
    isMarathi
      ? marathi
      : english;

  /* =========================================
     LABELS
  ========================================= */

  const guestTypeLabel =
    guestType === "ESM"
      ? tr(
          "ESM",
          "माजी सैनिक"
        )
      : guestType ===
        "SERVING"
      ? tr(
          "Serving",
          "सेवारत"
        )
      : guestType === "CIVILIAN"
      ? tr(
          "Civilian",
          "नागरिक"
        )
      : tr(
          "Not recorded",
          "नोंद उपलब्ध नाही"
        );

  const memoTypeLabel =
    memoType ===
    "CASH_MEMO"
      ? tr(
          "Cash Refund Memo",
          "रोख रिफंड मेमो"
        )
      : tr(
          "Credit Refund Memo",
          "क्रेडिट रिफंड मेमो"
        );

  /* =========================================
     VALIDATION
  ========================================= */

  const validateMemo =
    (): boolean => {
      if (
        !memoNumber.trim()
      ) {
        window.alert(
          tr(
            "Please enter the refund memo number.",
            "कृपया रिफंड मेमो क्रमांक प्रविष्ट करा."
          )
        );

        return false;
      }

      if (
        !memoDate
      ) {
        window.alert(
          tr(
            "Please select the memo date.",
            "कृपया मेमो तारीख निवडा."
          )
        );

        return false;
      }

      if (
        refundableAmount <=
        0
      ) {
        window.alert(
          tr(
            "Refundable amount must be greater than zero.",
            "रिफंड करण्यायोग्य रक्कम शून्यापेक्षा जास्त असावी."
          )
        );

        return false;
      }

      if (
        refundableAmount >
        paidAmount
      ) {
        window.alert(
          tr(
            "Refundable amount cannot exceed the paid amount.",
            "रिफंड रक्कम भरलेल्या रकमपेक्षा जास्त असू शकत नाही."
          )
        );

        return false;
      }

      const hasBankDetails = [
        bankAccountHolder,
        bankName,
        bankBranch,
        bankAccountNumber,
        bankIfsc,
      ].some((value) => value.trim());
      if (
        hasBankDetails &&
        (
          !bankAccountHolder.trim() ||
          !bankName.trim() ||
          !bankBranch.trim() ||
          !bankAccountNumber.trim() ||
          !bankIfsc.trim()
        )
      ) {
        window.alert(
          tr(
            "Complete all bank details.",
            "सर्व बँक तपशील भरा."
          )
        );
        return false;
      }

      if (
        memoType === "CREDIT_MEMO" &&
        !hasBankDetails
      ) {
        window.alert(
          tr(
            "Enter the booking person's bank details for a credit refund memo.",
            "क्रेडिट रिफंड मेमोसाठी बुकिंग व्यक्तीचे बँक तपशील भरा."
          )
        );
        return false;
      }

      if (
        !confirmed
      ) {
        window.alert(
          tr(
            "Please confirm the refund memo.",
            "कृपया रिफंड मेमोची पुष्टी करा."
          )
        );

        return false;
      }

      return true;
    };

  /* =========================================
     CONTINUE
  ========================================= */

  const handleContinue =
    async () => {
      if (
        !validateMemo()
      ) {
        return;
      }

      if (window.electronAPI && !(await handleSavePdf())) {
        return;
      }

      const data:
        RefundMemoData = {
        bookingId,
        bookingReference,

        guestId,
        guestName,
        bookingPersonName,
        bookingPersonAddress,

        guestType,

        accommodations,

        scheduledCheckOutDate,
        preCheckOutDate,

        totalAmount,
        paidAmount,

        adjustmentAmount,
        refundableAmount,
        retainedAmount,

        memoType,

        memoNumber:
          memoNumber.trim(),

        memoDate,

        remarks:
          remarks.trim(),

        bankDetails: {
          accountHolder: bankAccountHolder.trim(),
          bankName: bankName.trim(),
          branch: bankBranch.trim(),
          ifsc: bankIfsc.trim().toUpperCase(),
          accountNumber: bankAccountNumber.trim(),
        },
      };

      onContinue(
        data
      );
    };

  /* =========================================
     LANGUAGE SWITCHER
  ========================================= */

  const languageSwitcher = (
    <div
      className="language-switcher"
      aria-label="Language selection"
    >
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
        English
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
  );

  /* =========================================
     UI
  ========================================= */

  return (
    <main className="booking-screen">

      {/* =====================================
          HEADER
      ===================================== */}

      <header className="booking-header">

        <div>

          <span className="section-label">
            {tr(
              "REFUND MEMO",
              "रिफंड मेमो"
            )}
          </span>

          <h1>
            {tr(
              "Refund Memo",
              "रिफंड मेमो"
            )}
          </h1>

          <p>
            {tr(
              "Officer",
              "अधिकारी"
            )}
            : {officerName}
          </p>

        </div>

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "14px",
            flexWrap:
              "wrap",
            justifyContent:
              "flex-end",
          }}
        >
          {languageSwitcher}

          <button
            type="button"
            className="availability-back-button"
            onClick={handleBack}
          >
            ←{" "}
            {tr(
              "Back",
              "मागे"
            )}
          </button>
        </div>

      </header>


      {/* =====================================
          WORKFLOW
      ===================================== */}

      <section
        className="booking-card"
        style={{
          padding:
            "20px 24px",
        }}
      >

        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            gap:
              "10px",
            flexWrap:
              "wrap",
          }}
        >

          <span className="workflow-pill">
            PRE CHECK-OUT
          </span>

          <span>→</span>

          <span className="workflow-pill">
            REFUND CALCULATION
          </span>

          <span>→</span>

          <span
            style={{
              padding:
                "7px 12px",
              borderRadius:
                "20px",
              background:
                "#355d3b",
              color:
                "#ffffff",
              fontSize:
                "11px",
              fontWeight:
                800,
            }}
          >
            REFUND MEMO
          </span>

          <span>→</span>

          <span className="workflow-pill">
            WHATSAPP FEEDBACK
          </span>

        </div>

      </section>


      {/* =====================================
          MEMO DETAILS
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            01
          </span>

          <div>

            <h2>
              {tr(
                "Refund Memo Details",
                "रिफंड मेमो तपशील"
              )}
            </h2>

            <p>
              {tr(
                "Enter the official refund memo information.",
                "अधिकृत रिफंड मेमोची माहिती प्रविष्ट करा."
              )}
            </p>

          </div>

        </div>


        {/* MEMO TYPE */}

        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap:
              "14px",
            marginBottom:
              "18px",
          }}
        >

          <button
            type="button"
            onClick={() =>
              setMemoType(
                "CASH_MEMO"
              )
            }
            style={{
              textAlign:
                "left",
              padding:
                "18px",
              borderRadius:
                "11px",
              border:
                memoType ===
                "CASH_MEMO"
                  ? "2px solid #355d3b"
                  : "1px solid #d8e0d5",
              background:
                memoType ===
                "CASH_MEMO"
                  ? "#f1f7ef"
                  : "#ffffff",
              cursor:
                "pointer",
            }}
          >

            <strong
              style={{
                display:
                  "block",
                color:
                  "#304633",
                marginBottom:
                  "5px",
              }}
            >
              {tr(
                "CASH MEMO",
                "रोख मेमो"
              )}
            </strong>

            <span
              style={{
                fontSize:
                  "12px",
                color:
                  "#687367",
              }}
            >
              {tr(
                "Refund recorded as a cash refund memo.",
                "रिफंड रोख मेमो म्हणून नोंदवला जाईल."
              )}
            </span>

          </button>


          <button
            type="button"
            onClick={() =>
              setMemoType(
                "CREDIT_MEMO"
              )
            }
            style={{
              textAlign:
                "left",
              padding:
                "18px",
              borderRadius:
                "11px",
              border:
                memoType ===
                "CREDIT_MEMO"
                  ? "2px solid #355d3b"
                  : "1px solid #d8e0d5",
              background:
                memoType ===
                "CREDIT_MEMO"
                  ? "#f1f7ef"
                  : "#ffffff",
              cursor:
                "pointer",
            }}
          >

            <strong
              style={{
                display:
                  "block",
                color:
                  "#304633",
                marginBottom:
                  "5px",
              }}
            >
              {tr(
                "CREDIT MEMO",
                "क्रेडिट मेमो"
              )}
            </strong>

            <span
              style={{
                fontSize:
                  "12px",
                color:
                  "#687367",
              }}
            >
              {tr(
                "Refund recorded as a credit memo.",
                "रिफंड क्रेडिट मेमो म्हणून नोंदवला जाईल."
              )}
            </span>

          </button>

        </div>


        {/* MEMO NUMBER / DATE */}

        <div className="booking-grid">

          <div className="form-field">

            <label>
              {tr(
                "Refund Memo Number",
                "रिफंड मेमो क्रमांक"
              )}
            </label>

            <input type="text" value={memoNumber} readOnly />
            <small>{tr("Generated automatically for this booking.", "हा क्रमांक या बुकिंगसाठी स्वयंचलितपणे तयार केला आहे.")}</small>

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Memo Date",
                "मेमो तारीख"
              )}
            </label>

            <input
              type="date"
              value={
                memoDate
              }
              onChange={(
                event
              ) =>
                setMemoDate(
                  event.target
                    .value
                )
              }
            />

          </div>

        </div>

      </section>


      {/* =====================================
          BOOKING / GUEST DETAILS
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            02
          </span>

          <div>

            <h2>
              {tr(
                "Booking & Guest Details",
                "बुकिंग आणि अतिथी तपशील"
              )}
            </h2>

            <p>
              {tr(
                "Information carried forward from the refund calculation.",
                "रिफंड गणनेतून पुढे आलेली माहिती."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap:
              "14px",
          }}
        >

          <div className="summary-box">

            <small>
              {tr(
                "Booking Reference",
                "बुकिंग संदर्भ"
              )}
            </small>

            <strong>
              {bookingReference ||
                "-"}
            </strong>

          </div>


          <div className="summary-box">

            <small>
              {tr(
                "Guest Name",
                "अतिथीचे नाव"
              )}
            </small>

            <strong>
              {guestName}
            </strong>

          </div>


          <div className="summary-box">

            <small>
              {tr(
                "Guest Type",
                "अतिथी प्रकार"
              )}
            </small>

            <strong>
              {guestTypeLabel}
            </strong>

          </div>


          <div className="summary-box">

            <small>
              {tr(
                "Memo Type",
                "मेमो प्रकार"
              )}
            </small>

            <strong>
              {memoTypeLabel}
            </strong>

          </div>

        </div>

      </section>


      {/* =====================================
          ACCOMMODATION
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            03
          </span>

          <div>

            <h2>
              {tr(
                "Accommodation",
                "निवास व्यवस्था"
              )}
            </h2>

            <p>
              {tr(
                "Accommodation related to the refunded booking.",
                "रिफंड केलेल्या बुकिंगशी संबंधित निवास व्यवस्था."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display:
              "grid",
            gap:
              "10px",
          }}
        >

          {accommodations.length ===
          0 ? (

            <div
              style={{
                padding:
                  "18px",
                borderRadius:
                  "10px",
                background:
                  "#fff6f4",
                border:
                  "1px solid #e6c8c3",
                color:
                  "#7c4942",
              }}
            >
              {tr(
                "No accommodation information available.",
                "निवास व्यवस्थेची माहिती उपलब्ध नाही."
              )}
            </div>

          ) : (

            accommodations.map(
              (
                accommodation,
                index
              ) => (

                <div
                  key={`${accommodation.roomId}-${accommodation.bedId || index}`}
                  style={{
                    padding:
                      "15px 17px",
                    border:
                      "1px solid #dce3d8",
                    borderRadius:
                      "10px",
                    background:
                      "#fafbf9",
                    display:
                      "flex",
                    justifyContent:
                      "space-between",
                    alignItems:
                      "center",
                    gap:
                      "12px",
                  }}
                >

                  <div>

                    <strong
                      style={{
                        color:
                          "#304633",
                      }}
                    >
                      {
                        accommodation.roomName
                      }
                    </strong>

                    <div
                      style={{
                        marginTop:
                          "4px",
                        color:
                          "#687367",
                        fontSize:
                          "12px",
                      }}
                    >
                      {accommodation.bedId
                        ? tr(
                            `Bed ${accommodation.bedNumber ?? "-"}`,
                            `बेड ${accommodation.bedNumber ?? "-"}`
                          )
                        : tr(
                            "Whole Room",
                            "संपूर्ण खोली"
                          )}
                    </div>

                  </div>

                  <span className="workflow-pill">
                    REFUNDED
                  </span>

                </div>

              )
            )

          )}

        </div>

      </section>


      {/* =====================================
          FINANCIAL SUMMARY
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            ₹
          </span>

          <div>

            <h2>
              {tr(
                "Refund Financial Summary",
                "रिफंड आर्थिक सारांश"
              )}
            </h2>

            <p>
              {tr(
                "Final amounts transferred from the refund calculation stage.",
                "रिफंड गणना टप्प्यातून आलेल्या अंतिम रकमा."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display:
              "grid",
            gap:
              "10px",
          }}
        >

          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              padding:
                "13px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Original Total",
                "मूळ एकूण रक्कम"
              )}
            </span>

            <strong>
              {formatCurrency(
                totalAmount
              )}
            </strong>

          </div>


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              padding:
                "13px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Paid Amount",
                "भरलेली रक्कम"
              )}
            </span>

            <strong>
              {formatCurrency(
                paidAmount
              )}
            </strong>

          </div>


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              padding:
                "13px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Adjustment",
                "Adjustment"
              )}
            </span>

            <strong>
              {formatCurrency(
                adjustmentAmount
              )}
            </strong>

          </div>


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              alignItems:
                "center",
              padding:
                "18px 16px",
              marginTop:
                "5px",
              borderRadius:
                "10px",
              background:
                "#f1f7ef",
              border:
                "1px solid #cadcc6",
            }}
          >

            <strong
              style={{
                color:
                  "#304633",
                fontSize:
                  "16px",
              }}
            >
              {tr(
                "REFUNDABLE AMOUNT",
                "रिफंड करण्यायोग्य रक्कम"
              )}
            </strong>

            <strong
              style={{
                color:
                  "#304f35",
                fontSize:
                  "24px",
              }}
            >
              {formatCurrency(
                refundableAmount
              )}
            </strong>

          </div>


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              padding:
                "13px 16px",
              background:
                "#fafbf9",
              borderRadius:
                "9px",
            }}
          >

            <span>
              {tr(
                "Retained / Adjusted Amount",
                "ठेवलेली / Adjustment रक्कम"
              )}
            </span>

            <strong>
              {formatCurrency(
                retainedAmount
              )}
            </strong>

          </div>

        </div>

      </section>


      {/* =====================================
          MEMO REMARKS
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            04
          </span>

          <div>

            <h2>
              {tr(
                "Memo Remarks",
                "मेमो शेरा"
              )}
            </h2>

            <p>
              {tr(
                "Add supporting information for the refund memo.",
                "रिफंड मेमोसाठी आवश्यक माहिती नोंदवा."
              )}
            </p>

          </div>

        </div>


        <div className="form-field">

          <label>
            {tr(
              "Remarks",
              "शेरा"
            )}
          </label>

          <textarea
            value={
              remarks
            }
            onChange={(
              event
            ) =>
              setRemarks(
                event.target
                  .value
              )
            }
            rows={4}
            placeholder={tr(
              "Enter refund memo remarks...",
              "रिफंड मेमो शेरा प्रविष्ट करा..."
            )}
          />

        </div>

      </section>


      <section className="booking-card">
        <div className="booking-section-title">
          <span>05</span>
          <div>
            <h2>{tr("Refund bank details (optional)", "रिफंड बँक तपशील (ऐच्छिक)")}</h2>
            <p>{tr("Enter the account details here only when processing a refund memo.", "रिफंड मेमो तयार करताना आवश्यक असल्यासच येथे बँक तपशील भरा.")}</p>
          </div>
        </div>
        <div className="booking-grid">
          <div className="form-field">
            <label>{tr("Account holder", "खातेदाराचे नाव")}</label>
            <input
              value={bankAccountHolder}
              onChange={(event) => setBankAccountHolder(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label>{tr("Bank name", "बँकेचे नाव")}</label>
            <input value={bankName} onChange={(event) => setBankName(event.target.value)} />
          </div>
          <div className="form-field">
            <label>{tr("Branch", "शाखा")}</label>
            <input value={bankBranch} onChange={(event) => setBankBranch(event.target.value)} />
          </div>
          <div className="form-field">
            <label>{tr("Account number", "खाते क्रमांक")}</label>
            <input
              value={bankAccountNumber}
              onChange={(event) => setBankAccountNumber(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label>IFSC</label>
            <input
              value={bankIfsc}
              onChange={(event) => setBankIfsc(event.target.value)}
            />
          </div>
        </div>
      </section>

      {/* =====================================
          MEMO PREVIEW
      ===================================== */}

      <section className="booking-card refund-printable">

        <div className="booking-section-title">

          <span>
            06
          </span>

          <div>

            <h2>
              {tr(
                "Refund Memo Preview",
                "रिफंड मेमो पूर्वदृश्य"
              )}
            </h2>

            <p>
              {tr(
                "Review the memo before proceeding to feedback.",
                "फीडबॅक टप्प्यावर जाण्यापूर्वी मेमो तपासा."
              )}
            </p>

          </div>

        </div>


        <div className="refund-memo-print-document">
          <header className="refund-memo-print-header">
            <div className="refund-memo-brand">ESM REST HOUSE, PUNE</div>
            <div className="refund-memo-print-title">{memoTypeLabel}</div>
            <div className="refund-memo-print-number">
              <span>{tr("Refund Memo No.", "रिफंड मेमो क्र.")}</span>
              <strong>{memoNumber}</strong>
              <span>{tr("Date", "दिनांक")}: {memoDate}</span>
            </div>
          </header>

          <section className="refund-memo-print-person">
            <div className="refund-memo-print-section-label">{tr("BOOKING PERSON", "बुकिंग व्यक्ती")}</div>
            <h2>{bookingPersonName || "-"}</h2>
            <p>{bookingPersonAddress || "-"}</p>
          </section>

          <section className="refund-memo-print-details">
            <div><span>{tr("Guest", "अतिथी")}</span><strong>{guestName || "-"}</strong></div>
            <div><span>{tr("Guest type", "अतिथी प्रकार")}</span><strong>{guestTypeLabel}</strong></div>
            <div><span>{tr("Accommodation", "निवास")}</span><strong>
              {accommodations.length
                ? accommodations.map((item) =>
                    item.bedNumber
                      ? `${item.roomName} · ${tr("Bed", "बेड")} ${item.bedNumber}`
                      : item.roomName
                  ).join(", ")
                : "-"}
            </strong></div>
            <div><span>{tr("Scheduled checkout", "नियोजित चेक-आउट")}</span><strong>{scheduledCheckOutDate || "-"}</strong></div>
            <div><span>{tr("Pre-checkout", "लवकर चेक-आउट")}</span><strong>{preCheckOutDate || "-"}</strong></div>
            {bookingReference && <div><span>{tr("Booking reference", "बुकिंग संदर्भ")}</span><strong>{bookingReference}</strong></div>}
          </section>

          <table className="refund-memo-print-amounts">
            <tbody>
              <tr><th>{tr("Total amount", "एकूण रक्कम")}</th><td>{formatCurrency(totalAmount)}</td></tr>
              <tr><th>{tr("Paid amount", "भरलेली रक्कम")}</th><td>{formatCurrency(paidAmount)}</td></tr>
              <tr><th>{tr("Adjustment", "समायोजन")}</th><td>{formatCurrency(adjustmentAmount)}</td></tr>
              <tr><th>{tr("Retained amount", "ठेवलेली रक्कम")}</th><td>{formatCurrency(retainedAmount)}</td></tr>
              <tr className="refund-memo-print-total"><th>{tr("Refundable amount", "रिफंड करण्यायोग्य रक्कम")}</th><td>{formatCurrency(refundableAmount)}</td></tr>
            </tbody>
          </table>

          {(bankName || bankBranch || bankAccountNumber || bankIfsc) && (
            <section className="refund-memo-print-bank">
              <div className="refund-memo-print-section-label">{tr("REFUND BANK DETAILS — BOOKING PERSON", "रिफंड बँक तपशील — बुकिंग व्यक्ती")}</div>
              <div className="refund-memo-print-details">
                <div><span>{tr("Account holder", "खातेदाराचे नाव")}</span><strong>{bankAccountHolder || "-"}</strong></div>
                <div><span>{tr("Bank name", "बँकेचे नाव")}</span><strong>{bankName || "-"}</strong></div>
                <div><span>{tr("Branch", "शाखा")}</span><strong>{bankBranch || "-"}</strong></div>
                <div><span>{tr("Account number", "खाते क्रमांक")}</span><strong>{bankAccountNumber || "-"}</strong></div>
                <div><span>IFSC</span><strong>{bankIfsc || "-"}</strong></div>
              </div>
            </section>
          )}

          {remarks && <section className="refund-memo-print-remarks"><strong>{tr("Remarks", "शेरा")}:</strong> {remarks}</section>}

          <footer className="refund-memo-print-signatures">
            <div><span>{tr("Booking person's signature", "बुकिंग व्यक्तीची स्वाक्षरी")}</span></div>
            <div><span>{tr("Authorized officer", "अधिकृत अधिकारी")}</span><strong>{officerName}</strong></div>
          </footer>
        </div>

        <div className="refund-memo-screen-preview"
          style={{
            border:
              "1px solid #d7dfd3",
            borderRadius:
              "12px",
            overflow:
              "hidden",
            background:
              "#ffffff",
          }}
        >

          <div
            style={{
              padding:
                "20px",
              background:
                "#f4f7f2",
              borderBottom:
                "1px solid #d7dfd3",
              textAlign:
                "center",
            }}
          >

            <strong
              style={{
                display:
                  "block",
                fontSize:
                  "18px",
                color:
                  "#304633",
              }}
            >
              ESM REST HOUSE
            </strong>

            <span
              style={{
                display:
                  "block",
                marginTop:
                  "5px",
                fontSize:
                  "13px",
                fontWeight:
                  700,
                color:
                  "#526452",
              }}
            >
              {memoTypeLabel}
            </span>

          </div>


          <div
            style={{
              display:
                "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap:
                "1px",
              background:
                "#dfe5dc",
            }}
          >

            <div
              style={{
                padding:
                  "14px",
                background:
                  "#ffffff",
              }}
            >
              <small>
                {tr(
                  "Memo Number",
                  "मेमो क्रमांक"
                )}
              </small>

              <strong
                style={{
                  display:
                    "block",
                  marginTop:
                    "4px",
                }}
              >
                {memoNumber ||
                  "-"}
              </strong>
            </div>

            <div style={{ padding: "20px", borderTop: "1px solid #dfe5dc" }}>
              <p>
                <strong>{tr("Guest type", "अतिथी प्रकार")}:</strong> {guestTypeLabel}
              </p>
              <p>
                <strong>{tr("Accommodation", "निवास")}:</strong>{" "}
                {accommodations.length
                  ? accommodations
                      .map((item) =>
                        item.bedNumber
                          ? `${item.roomName} · ${tr("Bed", "बेड")} ${item.bedNumber}`
                          : item.roomName
                      )
                      .join(", ")
                  : "-"}
              </p>
              <p>
                <strong>{tr("Scheduled checkout", "नियोजित चेक-आउट")}:</strong>{" "}
                {scheduledCheckOutDate}
              </p>
              <p>
                <strong>{tr("Pre-checkout", "लवकर चेक-आउट")}:</strong>{" "}
                {preCheckOutDate}
              </p>
              <p><strong>{tr("Total amount", "एकूण रक्कम")}:</strong> {formatCurrency(totalAmount)}</p>
              <p><strong>{tr("Paid amount", "भरलेली रक्कम")}:</strong> {formatCurrency(paidAmount)}</p>
              <p><strong>{tr("Adjustment", "समायोजन")}:</strong> {formatCurrency(adjustmentAmount)}</p>
              <p><strong>{tr("Retained amount", "ठेवलेली रक्कम")}:</strong> {formatCurrency(retainedAmount)}</p>
              {remarks && <p><strong>{tr("Remarks", "शेरा")}:</strong> {remarks}</p>}
            </div>

            <div
              style={{
                padding:
                  "14px",
                background:
                  "#ffffff",
              }}
            >
              <small>
                {tr(
                  "Memo Date",
                  "मेमो तारीख"
                )}
              </small>

              <strong
                style={{
                  display:
                    "block",
                  marginTop:
                    "4px",
                }}
              >
                {memoDate ||
                  "-"}
              </strong>
            </div>


            <div
              style={{
                padding:
                  "14px",
                background:
                  "#ffffff",
              }}
            >
              <small>
                {tr(
                  "Booking Reference",
                  "बुकिंग संदर्भ"
                )}
              </small>

              <strong
                style={{
                  display:
                    "block",
                  marginTop:
                    "4px",
                }}
              >
                {bookingReference ||
                  "-"}
              </strong>
            </div>


            <div
              style={{
                padding:
                  "14px",
                background:
                  "#ffffff",
              }}
            >
              <small>
                {tr(
                  "Guest",
                  "अतिथी"
                )}
              </small>

              <strong
                style={{
                  display:
                    "block",
                  marginTop:
                    "4px",
                }}
              >
                {guestName}
              </strong>
            </div>

            <div
              style={{
                padding: "14px",
                background: "#ffffff",
              }}
            >
              <small>{tr("Booking person", "बुकिंग व्यक्ती")}</small>
              <strong style={{ display: "block", marginTop: "4px" }}>
                {bookingPersonName || "-"}
              </strong>
            </div>

            <div
              style={{
                padding: "14px",
                background: "#ffffff",
              }}
            >
              <small>{tr("Address", "पत्ता")}</small>
              <strong style={{ display: "block", marginTop: "4px" }}>
                {bookingPersonAddress || "-"}
              </strong>
            </div>

          </div>


          <div
            style={{
              padding:
                "20px",
            }}
          >

            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                padding:
                  "16px",
                borderRadius:
                  "10px",
                background:
                  "#f1f7ef",
                border:
                  "1px solid #cadcc6",
              }}
            >

              <strong>
                {tr(
                  "Refund Amount",
                  "रिफंड रक्कम"
                )}
              </strong>

              <strong
                style={{
                  fontSize:
                    "22px",
                  color:
                    "#304f35",
                }}
              >
                {formatCurrency(
                  refundableAmount
                )}
              </strong>

            </div>

            {(bankName || bankBranch || bankAccountNumber || bankIfsc) && (
              <div style={{ padding: "0 20px 20px" }}>
                <strong>{tr("Refund bank details", "रिफंड बँक तपशील")}</strong>
                <p>{bankAccountHolder} · {bankName} · {bankBranch}</p>
                <p>{tr("Account", "खाते")}: {bankAccountNumber} · IFSC: {bankIfsc}</p>
              </div>
            )}

          </div>

        </div>

      </section>


      {/* =====================================
          CONFIRMATION
      ===================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            07
          </span>

          <div>

            <h2>
              {tr(
                "Final Confirmation",
                "अंतिम पुष्टी"
              )}
            </h2>

            <p>
              {tr(
                "Confirm the refund memo before moving to WhatsApp feedback.",
                "WhatsApp फीडबॅककडे जाण्यापूर्वी रिफंड मेमोची पुष्टी करा."
              )}
            </p>

          </div>

        </div>


        <button
          type="button"
          onClick={() =>
            setConfirmed(
              !confirmed
            )
          }
          style={{
            width:
              "100%",
            textAlign:
              "left",
            padding:
              "19px",
            borderRadius:
              "12px",
            border:
              confirmed
                ? "2px solid #355d3b"
                : "1px solid #d8e0d5",
            background:
              confirmed
                ? "#f1f7ef"
                : "#ffffff",
            cursor:
              "pointer",
          }}
        >

          <div
            style={{
              display:
                "flex",
              alignItems:
                "center",
              gap:
                "14px",
            }}
          >

            <div
              style={{
                width:
                  "30px",
                height:
                  "30px",
                borderRadius:
                  "7px",
                background:
                  confirmed
                    ? "#355d3b"
                    : "#e8ece6",
                color:
                  confirmed
                    ? "#ffffff"
                    : "#647060",
                display:
                  "flex",
                alignItems:
                  "center",
                justifyContent:
                  "center",
                fontWeight:
                  900,
              }}
            >
              {confirmed
                ? "✓"
                : ""}
            </div>

            <div>

              <strong
                style={{
                  display:
                    "block",
                  color:
                    "#304633",
                  fontSize:
                    "14px",
                }}
              >
                {tr(
                  "I confirm that the refund memo details have been reviewed and are ready for the next stage.",
                  "रिफंड मेमोचे तपशील तपासले असून पुढील टप्प्यासाठी ते तयार आहेत याची मी पुष्टी करतो."
                )}
              </strong>

              <span
                style={{
                  display:
                    "block",
                  marginTop:
                    "5px",
                  color:
                    "#687367",
                  fontSize:
                    "12px",
                }}
              >
                {nextStageDescription ||
                  tr(
                    "The next stage is WhatsApp feedback.",
                    "पुढील टप्पा WhatsApp फीडबॅक आहे."
                  )}
              </span>

            </div>

          </div>

        </button>

      </section>


      {/* =====================================
          FOOTER
      ===================================== */}

      <div className="booking-actions">

        <button
          type="button"
          className="secondary-action refund-print-button"
          onClick={handleSavePdf}
          disabled={savingPdf}
        >
          {savingPdf
            ? tr("SAVING REFUND MEMO PDF…", "रिफंड मेमो PDF सेव्ह होत आहे…")
            : tr("SAVE REFUND MEMO PDF", "रिफंड मेमो PDF सेव्ह करा")}
        </button>

        <button
          type="button"
          className="secondary-action"
          onClick={handleBack}
        >
          {tr(
            "BACK TO REFUND CALCULATION",
            "रिफंड गणनेकडे मागे"
          )}
        </button>


        <button
          type="button"
          className="continue-booking-button"
          onClick={
            handleContinue
          }
          disabled={
            !confirmed || loading
          }
          style={{
            opacity:
              confirmed && !loading
                ? 1
                : 0.55,
            cursor:
              confirmed && !loading
                ? "pointer"
                : "not-allowed",
          }}
        >
          {loading
            ? tr("SAVING REFUND MEMO...", "रिफंड मेमो जतन होत आहे...")
            : continueLabel ||
              tr(
                "PROCEED TO WHATSAPP FEEDBACK →",
                "WhatsApp फीडबॅककडे जा →"
              )}
        </button>

      </div>
      {pdfSaveError && (
        <p role="alert" className="dashboard-error">
          {tr("Refund memo PDF was not saved:", "रिफंड मेमो PDF सेव्ह झाला नाही:")}{" "}
          {pdfSaveError}
        </p>
      )}

    </main>
  );
}

export default RefundMemo;