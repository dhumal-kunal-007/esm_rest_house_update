import { useState } from "react";

import "../App.css";

import { useLanguage } from "../i18n/LanguageContext";
import type { BedRateDetail } from "./Rate";

/* =================================
   TYPES
================================== */

export type InvoiceType =
  | "CASH_MEMO"
  | "CREDIT_MEMO";

export interface InvoiceData {
  bookingId?: string;

  bookingReference?: string;

  invoiceType: InvoiceType;

  invoiceNumber: string;

  invoiceDate: string;

  guestName: string;

  guestType:
    | "ESM"
    | "SERVING"
    | "CIVILIAN";

  bedRateDetails?: BedRateDetail[];

  accommodationDays?: number;

  totalAmount: number;

  paidAmount: number;

  balanceAmount: number;

  paymentMethod:
    | "CASH"
    | "ONLINE"
    | "UPI"
    | "CHEQUE";

  transactionNumber: string;

  remarks: string;
}

export interface InvoiceAccommodation {
  roomName: string;
  bedNumber?: number;
  guestName: string;
}

interface InvoiceProps {
  officerName: string;

  bookingId?: string;

  bookingReference?: string;

  guestName: string;

  guestType:
    | "ESM"
    | "SERVING"
    | "CIVILIAN";

  bedRateDetails?: BedRateDetail[];

  accommodationDays?: number;

  totalAmount: number;

  paidAmount: number;

  paymentMethod:
    | "CASH"
    | "ONLINE"
    | "UPI"
    | "CHEQUE";

  transactionNumber?: string;

  paymentDate?: string;

  checkIn: string;

  checkOut: string;

  accommodations: InvoiceAccommodation[];

  generatedInvoice?: InvoiceData | null;

  onBack: () => void;

  onContinue: (
    invoice: InvoiceData
  ) => void;

  onContinueToRoomLock: () => void;
}

/* =================================
   HELPERS
================================== */

const getTodayDate = (): string => {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
};

const formatCurrency = (
  amount: number
): string => {

  return `₹${amount.toLocaleString(
    "en-IN",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}`;
};

const formatDate = (
  value: string | undefined
): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const formatDateTime = (
  value: string | undefined
): string => {
  if (!value) {
    return "—";
  }

  const date = formatDate(value);
  const time = value.includes("T") ? value.slice(11, 16) : "";
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return date;
  }

  const hour = Number(match[1]);
  const minute = match[2];
  if (hour > 23 || Number(minute) > 59) {
    return date;
  }

  const hour12 = hour % 12 || 12;
  const period = hour >= 12 ? "PM" : "AM";
  return `${date}, ${hour12}:${minute} ${period}`;
};

/* =================================
   COMPONENT
================================== */

function Invoice({
  officerName,
  bookingId,
  bookingReference,
  guestName,
  guestType,
  bedRateDetails = [],
  accommodationDays = 0,
  totalAmount,
  paidAmount,
  paymentMethod,
  transactionNumber = "",
  paymentDate,
  checkIn,
  checkOut,
  accommodations,
  generatedInvoice = null,
  onBack,
  onContinue,
  onContinueToRoomLock,
}: InvoiceProps) {

  const {
    language,
    setLanguage,
  } = useLanguage();

  const isMarathi =
    language === "mr";

  /* =================================
     STATE
  ================================== */

  const [
    invoiceType,
    setInvoiceType,
  ] =
    useState<InvoiceType>(
      "CASH_MEMO"
    );

  const [
    invoiceDate,
    setInvoiceDate,
  ] =
    useState(
      getTodayDate()
    );

  const [
    remarks,
    setRemarks,
  ] =
    useState("");

  const [savingInvoicePdf, setSavingInvoicePdf] = useState(false);
  const [invoicePdfError, setInvoicePdfError] = useState("");
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState<string | null>(
    null
  );

  /* =================================
     TRANSLATION
  ================================== */

  const tr = (
    english: string,
    marathi: string
  ) =>
    isMarathi
      ? marathi
      : english;

  const printedGuestTypeLabel =
    bedRateDetails.length > 0
      ? tr("Per-guest rate", "प्रत्येक अतिथीनुसार दर")
      : guestType === "ESM"
      ? tr("Ex-Servicemen", "माजी सैनिक")
      : guestType === "SERVING"
      ? tr("Serving Personnel", "सेवारत कर्मचारी")
      : tr("Civilian", "नागरिक");

  const invoiceTypeLabel = (
    type: InvoiceType
  ) =>
    type === "CASH_MEMO"
      ? tr("Cash Memo", "रोख मेमो")
      : tr("Credit Memo", "क्रेडिट मेमो");

  if (generatedInvoice) {
    const saveInvoicePdf = async () => {
      if (!window.electronAPI) {
        throw new Error(
          "Invoice auto-save is available only in the ESM Rest House desktop app."
        );
      }
      await window.electronAPI.saveInvoicePdf(
        generatedInvoice.invoiceNumber
      );
      setSavedInvoiceNumber(generatedInvoice.invoiceNumber);
    };

    const printInvoice = async () => {
      setInvoicePdfError("");
      if (
        !window.electronAPI ||
        savedInvoiceNumber === generatedInvoice.invoiceNumber
      ) {
        window.print();
        return;
      }

      setSavingInvoicePdf(true);
      try {
        await saveInvoicePdf();
      } catch (error) {
        console.error("Invoice PDF auto-save failed:", error);
        setInvoicePdfError(
          error instanceof Error
            ? error.message
            : "Unable to save the invoice PDF."
        );
      } finally {
        setSavingInvoicePdf(false);
        window.print();
      }
    };

    const invoiceBedRateDetails =
      generatedInvoice.bedRateDetails ?? bedRateDetails;
    const invoiceAccommodationDays =
      generatedInvoice.accommodationDays ?? accommodationDays;
    const renderInvoiceCopy = (copyType: "GUEST" | "ESM") => (
      <section
        className={`invoice-copy invoice-copy-${copyType.toLowerCase()}`}
        key={copyType}
      >
        <header className="invoice-document-header">
          <div className="invoice-document-brandmark" aria-hidden="true">
            ESM
          </div>
          <div className="invoice-document-brand">
            <h2>ESM REST HOUSE</h2>
            <p>{tr("ACCOMMODATION SERVICES", "निवास सेवा")}</p>
          </div>
          <div className="invoice-document-copy">
            {copyType === "GUEST"
              ? tr("GUEST COPY", "अतिथी प्रत")
              : tr("ESM COPY", "ईएसएम प्रत")}
          </div>
        </header>

        <div className="invoice-document-title">
          <h1>{invoiceTypeLabel(generatedInvoice.invoiceType)}</h1>
          <p>{tr("Accommodation Payment Receipt", "निवास पेमेंट पावती")}</p>
        </div>

        <section className="invoice-document-meta">
          <div>
            <span>{tr("Invoice No.", "इनव्हॉइस क्र.")}</span>
            <strong>{generatedInvoice.invoiceNumber}</strong>
          </div>
          <div>
            <span>{tr("Invoice Date", "इनव्हॉइस तारीख")}</span>
            <strong>{formatDate(generatedInvoice.invoiceDate)}</strong>
          </div>
          <div>
            <span>{tr("Booking Reference", "बुकिंग संदर्भ")}</span>
            <strong>
              {bookingReference ||
                generatedInvoice.bookingReference ||
                "—"}
            </strong>
          </div>
        </section>

        <section className="invoice-document-parties">
          <div>
            <span className="invoice-document-label">
              {tr("RECEIVED FROM", "यांच्याकडून प्राप्त")}
            </span>
            <h3>{generatedInvoice.guestName}</h3>
            <p>{printedGuestTypeLabel}</p>
          </div>
          <div>
            <span className="invoice-document-label">
              {tr("STAY PERIOD", "निवास कालावधी")}
            </span>
            <p>
              <strong>{tr("Check-in:", "चेक-इन:")}</strong>{" "}
              {formatDateTime(checkIn)}
            </p>
            <p>
              <strong>{tr("Check-out:", "चेक-आउट:")}</strong>{" "}
              {formatDateTime(checkOut)}
            </p>
          </div>
        </section>

        <section className="invoice-document-section">
          <h3>{tr("ACCOMMODATION DETAILS", "निवास तपशील")}</h3>
          <table className="invoice-document-table">
            <thead>
              <tr>
                <th>{tr("Room / Bed", "खोली / बेड")}</th>
                <th>{tr("Occupant", "अतिथी")}</th>
                <th>{tr("Stay", "कालावधी")}</th>
              </tr>
            </thead>
            <tbody>
              {accommodations.map((item, index) => (
                <tr key={`${item.roomName}-${item.guestName}-${index}`}>
                  <td>
                    {item.roomName}
                    {item.bedNumber
                      ? ` — ${tr("Bed", "बेड")} ${item.bedNumber}`
                      : ` — ${tr("Whole room", "संपूर्ण खोली")}`}
                  </td>
                  <td>{item.guestName}</td>
                  <td>
                    {formatDateTime(checkIn)} – {formatDateTime(checkOut)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {invoiceBedRateDetails.length > 0 && (
          <section className="invoice-document-section">
            <h3>{tr("DM BED RATE BREAKDOWN", "DM बेड दर तपशील")}</h3>
            <table className="invoice-document-table">
              <thead>
                <tr>
                  <th>{tr("Room / Bed", "खोली / बेड")}</th>
                  <th>{tr("Occupant / Type", "अतिथी / प्रकार")}</th>
                  <th>{tr("Rate × Days", "दर × दिवस")}</th>
                  <th>{tr("Amount", "रक्कम")}</th>
                </tr>
              </thead>
              <tbody>
                {invoiceBedRateDetails.map((detail, index) => {
                  const rateTypeLabel =
                    detail.guestType === "ESM"
                      ? "ESM"
                      : detail.guestType === "SERVING"
                        ? tr("Serving", "सेवारत")
                        : tr("Civilian", "नागरिक");
                  return (
                    <tr
                      key={`${detail.roomName}-${detail.bedNumber}-${detail.guestName}-${index}`}
                    >
                      <td>
                        {detail.roomName} — {tr("Bed", "बेड")}{" "}
                        {detail.bedNumber}
                      </td>
                      <td>
                        {detail.guestName} · {rateTypeLabel}
                      </td>
                      <td>
                        {formatCurrency(detail.dailyRate)} ×{" "}
                        {invoiceAccommodationDays} {tr("day(s)", "दिवस")}
                      </td>
                      <td>{formatCurrency(detail.stayAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <section className="invoice-document-section">
          <h3>{tr("PAYMENT SUMMARY", "पेमेंट सारांश")}</h3>
          <table className="invoice-document-table invoice-document-amounts">
            <tbody>
              <tr>
                <td>{tr("Accommodation charges", "निवास शुल्क")}</td>
                <td>{formatCurrency(generatedInvoice.totalAmount)}</td>
              </tr>
              <tr className="invoice-document-paid">
                <td>{tr("Amount received", "प्राप्त रक्कम")}</td>
                <td>{formatCurrency(generatedInvoice.paidAmount)}</td>
              </tr>
              <tr className="invoice-document-balance">
                <th>{tr("Balance payable", "देय बाकी")}</th>
                <th>{formatCurrency(generatedInvoice.balanceAmount)}</th>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="invoice-document-payment">
          <div>
            <span>{tr("Payment Mode", "पेमेंट पद्धत")}</span>
            <strong>{generatedInvoice.paymentMethod.replace("_", " ")}</strong>
          </div>
          <div>
            <span>{tr("Payment Date", "पेमेंट तारीख")}</span>
            <strong>{formatDate(paymentDate)}</strong>
          </div>
          {generatedInvoice.transactionNumber && (
            <div>
              <span>{tr("Transaction / Reference No.", "व्यवहार / संदर्भ क्र.")}</span>
              <strong>{generatedInvoice.transactionNumber}</strong>
            </div>
          )}
        </section>

        {generatedInvoice.remarks && (
          <section className="invoice-document-remarks">
            <strong>{tr("Remarks:", "शेरा:")}</strong>{" "}
            {generatedInvoice.remarks}
          </section>
        )}

        <footer className="invoice-document-footer">
          <p>
            {tr(
              "This receipt acknowledges the payment recorded against the booking shown above.",
              "वरील बुकिंगसाठी नोंदवलेल्या पेमेंटची ही पावती आहे."
            )}
          </p>
          <div className="invoice-document-signatures">
            <div>
              <span>{tr("Guest / Payer", "अतिथी / पैसे भरणारा")}</span>
            </div>
            <div>
              <span>{tr("Authorized Signatory", "अधिकृत स्वाक्षरी")}</span>
            </div>
          </div>
          <small>
            {tr("Please retain this receipt for your records.", "कृपया ही पावती नोंदीसाठी जतन करा.")}
          </small>
        </footer>
      </section>
    );

    return (
      <main className="invoice-issued-screen">
        <div className="invoice-issued-toolbar">
          <div>
            <span className="section-label">
              {tr("INVOICE ISSUED", "इनव्हॉइस जारी")}
            </span>
            <h1>
              {tr(
                "Print or save this invoice",
                "हे इनव्हॉइस प्रिंट किंवा सेव्ह करा"
              )}
            </h1>
            <p>
              {tr(
                "The invoice number is final. Print or save a copy before continuing to room locking.",
                "इनव्हॉइस क्रमांक निश्चित आहे. रूम लॉककडे जाण्यापूर्वी प्रत प्रिंट किंवा सेव्ह करा."
              )}
            </p>
          </div>
          <div className="invoice-issued-actions">
            <button
              type="button"
              className="secondary-action invoice-screen-only"
              disabled={savingInvoicePdf}
              onClick={() => void printInvoice()}
            >
              {tr("PRINT / SAVE PDF", "प्रिंट / PDF सेव्ह करा")}
            </button>
            <button
              type="button"
              className="continue-booking-button invoice-screen-only"
              disabled={savingInvoicePdf}
              onClick={async () => {
                setSavingInvoicePdf(true);
                setInvoicePdfError("");
                try {
                  if (savedInvoiceNumber !== generatedInvoice.invoiceNumber) {
                    await saveInvoicePdf();
                  }
                  onContinueToRoomLock();
                } catch (error) {
                  console.error("Invoice PDF auto-save failed:", error);
                  setInvoicePdfError(
                    error instanceof Error
                      ? error.message
                      : "Unable to save the invoice PDF."
                  );
                } finally {
                  setSavingInvoicePdf(false);
                }
              }}
            >
              {savingInvoicePdf
                ? tr("SAVING INVOICE PDF…", "इनव्हॉइस PDF सेव्ह होत आहे…")
                : tr("CONTINUE TO ROOM LOCK →", "रूम लॉककडे पुढे →")}
            </button>
          </div>
        </div>
        {invoicePdfError && (
          <p role="alert" className="dashboard-error">
            {tr("Invoice PDF was not saved:", "इनव्हॉइस PDF सेव्ह झाला नाही:")}{" "}
            {invoicePdfError}
          </p>
        )}

        <article className="invoice-printable" aria-label="Printable invoice">
          {renderInvoiceCopy("GUEST")}
          {generatedInvoice.invoiceType === "CASH_MEMO" &&
            renderInvoiceCopy("ESM")}
        </article>
      </main>
    );
  }

  /* =================================
     LANGUAGE SWITCHER
  ================================== */

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

  /* =================================
     LABELS
  ================================== */

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
      : tr(
          "Civilian",
          "नागरिक"
        );


  const paymentMethodLabel =
    paymentMethod ===
    "CASH"
      ? tr(
          "Cash",
          "रोख"
        )
      : paymentMethod ===
        "ONLINE"
      ? tr(
          "Online",
          "ऑनलाइन"
        )
      : paymentMethod ===
        "UPI"
      ? "UPI"
      : tr(
          "Cheque",
          "धनादेश"
        );

  /* =================================
     BALANCE
  ================================== */

  const safeTotal =
    Math.max(
      0,
      totalAmount
    );

  const safePaid =
    Math.max(
      0,
      Math.min(
        paidAmount,
        safeTotal
      )
    );

  const balanceAmount =
    Math.max(
      0,
      safeTotal -
        safePaid
    );

  /* =================================
     VALIDATION
  ================================== */

  const validateInvoice =
    (): boolean => {

      if (
        !invoiceDate
      ) {
        window.alert(
          tr(
            "Please select the invoice date.",
            "कृपया इनव्हॉइसची तारीख निवडा."
          )
        );

        return false;
      }

      if (
        safeTotal <= 0
      ) {
        window.alert(
          tr(
            "The invoice amount must be greater than zero.",
            "इनव्हॉइसची रक्कम शून्यापेक्षा जास्त असणे आवश्यक आहे."
          )
        );

        return false;
      }

      if (
        safePaid <= 0
      ) {
        window.alert(
          tr(
            "No valid payment amount is available for this invoice.",
            "या इनव्हॉइससाठी वैध पेमेंट रक्कम उपलब्ध नाही."
          )
        );

        return false;
      }

      return true;
    };

  /* =================================
     CONTINUE
  ================================== */

  const handleContinue =
    () => {

      if (
        !validateInvoice()
      ) {
        return;
      }

      const invoice:
        InvoiceData = {
        bookingId,

        bookingReference,

        invoiceType,

        invoiceNumber: "",

        invoiceDate,

        guestName,

        guestType,

        bedRateDetails,

        accommodationDays,

        totalAmount:
          safeTotal,

        paidAmount:
          safePaid,

        balanceAmount,

        paymentMethod,

        transactionNumber:
          transactionNumber.trim(),

        remarks:
          remarks.trim(),
      };

      onContinue(
        invoice
      );
    };

  /* =================================
     UI
  ================================== */

  return (
    <main className="booking-screen">

      {/* =================================
          HEADER
      ================================== */}

      <header className="booking-header">

        <div>

          <span className="section-label">
            {tr(
              "INVOICE",
              "इनव्हॉइस"
            )}
          </span>

          <h1>
            {tr(
              "Invoice Generation",
              "इनव्हॉइस तयार करणे"
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
            onClick={
              onBack
            }
          >
            ←{" "}
            {tr(
              "Back",
              "मागे"
            )}
          </button>

        </div>

      </header>


      {/* =================================
          PROGRESS
      ================================== */}

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

          {[
            "01 REGISTRATION",
            "02 AVAILABILITY",
            "03 ACCEPTANCE",
            "04 GUEST TYPE",
            "05 RATE",
            "06 BOOKING",
            "07 APPROVAL",
            "08 PAYMENT",
          ].map(
            (
              step,
              index
            ) => (
              <div
                key={
                  step
                }
                style={{
                  display:
                    "flex",
                  alignItems:
                    "center",
                  gap:
                    "10px",
                }}
              >

                <span
                  style={{
                    padding:
                      "7px 12px",
                    borderRadius:
                      "20px",
                    background:
                      "#edf1eb",
                    color:
                      "#647060",
                    fontSize:
                      "11px",
                    fontWeight:
                      800,
                  }}
                >
                  {step}
                </span>

                {index <
                  7 && (
                  <span
                    style={{
                      color:
                        "#a1aaa0",
                    }}
                  >
                    →
                  </span>
                )}

              </div>
            )
          )}

          <span
            style={{
              color:
                "#a1aaa0",
            }}
          >
            →
          </span>

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
            09 INVOICE
          </span>

        </div>

      </section>


      {/* =================================
          PAYMENT CONFIRMED NOTICE
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding:
            "22px 28px",
          background:
            "#f1f7ef",
          border:
            "1px solid #cadcc6",
        }}
      >

        <div
          style={{
            display:
              "flex",
            alignItems:
              "flex-start",
            gap:
              "15px",
          }}
        >

          <div
            style={{
              width:
                "44px",
              height:
                "44px",
              minWidth:
                "44px",
              borderRadius:
                "50%",
              background:
                "#355d3b",
              color:
                "#ffffff",
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              fontWeight:
                900,
              fontSize:
                "18px",
            }}
          >
            ₹
          </div>

          <div>

            <h2
              style={{
                margin:
                  "0 0 6px",
                color:
                  "#304633",
                fontSize:
                  "18px",
              }}
            >
              {tr(
                "Payment recorded — generate invoice",
                "पेमेंट नोंदवले आहे — इनव्हॉइस तयार करा"
              )}
            </h2>

            <p
              style={{
                margin: 0,
                color:
                  "#657064",
                fontSize:
                  "13px",
                lineHeight:
                  1.6,
              }}
            >
              {tr(
                "Review the payment and generate the applicable Cash Memo or Credit Memo.",
                "पेमेंट तपासा आणि लागू रोख मेमो किंवा क्रेडिट मेमो तयार करा."
              )}
            </p>

          </div>

        </div>

      </section>


      {/* =================================
          INVOICE TYPE
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            09
          </span>

          <div>

            <h2>
              {tr(
                "Invoice Type",
                "इनव्हॉइस प्रकार"
              )}
            </h2>

            <p>
              {tr(
                "Select the document type to be generated.",
                "तयार करावयाच्या दस्तऐवजाचा प्रकार निवडा."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display:
              "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap:
              "16px",
          }}
        >

          {/* CASH MEMO */}

          <button
            type="button"
            onClick={() =>
              setInvoiceType(
                "CASH_MEMO"
              )
            }
            style={{
              textAlign:
                "left",
              border:
                invoiceType ===
                "CASH_MEMO"
                  ? "2px solid #355d3b"
                  : "1px solid #dce3d8",
              background:
                invoiceType ===
                "CASH_MEMO"
                  ? "#f1f7ef"
                  : "#ffffff",
              borderRadius:
                "13px",
              padding:
                "22px",
              cursor:
                "pointer",
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
                gap:
                  "12px",
              }}
            >

              <strong
                style={{
                  color:
                    "#304633",
                  fontSize:
                    "17px",
                }}
              >
                {tr(
                  "Cash Memo",
                  "रोख मेमो"
                )}
              </strong>

              <span
                style={{
                  width:
                    "28px",
                  height:
                    "28px",
                  borderRadius:
                    "50%",
                  background:
                    invoiceType ===
                    "CASH_MEMO"
                      ? "#355d3b"
                      : "#e7ece5",
                  color:
                    invoiceType ===
                    "CASH_MEMO"
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
                {invoiceType ===
                "CASH_MEMO"
                  ? "✓"
                  : "1"}
              </span>

            </div>

            <p
              style={{
                margin:
                  "9px 0 0",
                color:
                  "#6b756a",
                fontSize:
                  "12px",
                lineHeight:
                  1.6,
              }}
            >
              {tr(
                "Generate a Cash Memo for the recorded payment.",
                "नोंदवलेल्या पेमेंटसाठी रोख मेमो तयार करा."
              )}
            </p>

          </button>


          {/* CREDIT MEMO */}

          <button
            type="button"
            onClick={() =>
              setInvoiceType(
                "CREDIT_MEMO"
              )
            }
            style={{
              textAlign:
                "left",
              border:
                invoiceType ===
                "CREDIT_MEMO"
                  ? "2px solid #355d3b"
                  : "1px solid #dce3d8",
              background:
                invoiceType ===
                "CREDIT_MEMO"
                  ? "#f1f7ef"
                  : "#ffffff",
              borderRadius:
                "13px",
              padding:
                "22px",
              cursor:
                "pointer",
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
                gap:
                  "12px",
              }}
            >

              <strong
                style={{
                  color:
                    "#304633",
                  fontSize:
                    "17px",
                }}
              >
                {tr(
                  "Credit Memo",
                  "क्रेडिट मेमो"
                )}
              </strong>

              <span
                style={{
                  width:
                    "28px",
                  height:
                    "28px",
                  borderRadius:
                    "50%",
                  background:
                    invoiceType ===
                    "CREDIT_MEMO"
                      ? "#355d3b"
                      : "#e7ece5",
                  color:
                    invoiceType ===
                    "CREDIT_MEMO"
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
                {invoiceType ===
                "CREDIT_MEMO"
                  ? "✓"
                  : "2"}
              </span>

            </div>

            <p
              style={{
                margin:
                  "9px 0 0",
                color:
                  "#6b756a",
                fontSize:
                  "12px",
                lineHeight:
                  1.6,
              }}
            >
              {tr(
                "Generate a Credit Memo for the approved credit/payment record.",
                "मंजूर क्रेडिट / पेमेंट नोंदीसाठी क्रेडिट मेमो तयार करा."
              )}
            </p>

          </button>

        </div>

      </section>


      {/* =================================
          INVOICE DETAILS
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            01
          </span>

          <div>

            <h2>
              {tr(
                "Invoice Details",
                "इनव्हॉइस तपशील"
              )}
            </h2>

            <p>
              {tr(
                "The invoice number will be generated automatically when you continue.",
                "पुढे गेल्यावर इनव्हॉइस क्रमांक आपोआप तयार केला जाईल."
              )}
            </p>

          </div>

        </div>


        <div className="booking-grid">

          <div className="form-field">

            <label>
              {tr(
                "Invoice Date *",
                "इनव्हॉइस तारीख *"
              )}
            </label>

            <input
              type="date"
              value={
                invoiceDate
              }
              max={
                getTodayDate()
              }
              onChange={(
                event
              ) =>
                setInvoiceDate(
                  event.target
                    .value
                )
              }
            />

          </div>

        </div>

      </section>


      {/* =================================
          CUSTOMER SUMMARY
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            02
          </span>

          <div>

            <h2>
              {tr(
                "Guest & Payment Summary",
                "अतिथी आणि पेमेंट सारांश"
              )}
            </h2>

            <p>
              {tr(
                "Information carried from the approved payment stage.",
                "मंजूर पेमेंट टप्प्यातून आलेली माहिती."
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

          <div
            style={{
              padding:
                "16px",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
              background:
                "#fafbf9",
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
                  "6px",
                color:
                  "#304633",
              }}
            >
              {guestName}
            </strong>

          </div>


          <div
            style={{
              padding:
                "16px",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
              background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Guest Type",
                "अतिथी प्रकार"
              )}
            </small>

            <strong
              style={{
                display:
                  "block",
                marginTop:
                  "6px",
                color:
                  "#304633",
              }}
            >
              {guestTypeLabel}
            </strong>

          </div>


          <div
            style={{
              padding:
                "16px",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
                background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Payment Mode",
                "पेमेंट पद्धत"
              )}
            </small>

            <strong
              style={{
                display:
                  "block",
                marginTop:
                  "6px",
                color:
                  "#304633",
              }}
            >
              {paymentMethodLabel}
            </strong>

          </div>


          <div
            style={{
              padding:
                "16px",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
              background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Payment Date",
                "पेमेंट तारीख"
              )}
            </small>

            <strong
              style={{
                display:
                  "block",
                marginTop:
                  "6px",
                color:
                  "#304633",
              }}
            >
              {paymentDate ??
                "-"}
            </strong>

          </div>

        </div>


        {transactionNumber && (
          <div
            style={{
              marginTop:
                "14px",
              padding:
                "13px 16px",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "9px",
              background:
                "#fafbf9",
              fontSize:
                "12px",
              color:
                "#687367",
            }}
          >
            <strong>
              {tr(
                "Transaction / Reference No.:",
                "व्यवहार / संदर्भ क्रमांक:"
              )}
            </strong>{" "}
            {transactionNumber}
          </div>
        )}

      </section>


      {/* =================================
          FINANCIAL SUMMARY
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            ₹
          </span>

          <div>

            <h2>
              {tr(
                "Financial Summary",
                "आर्थिक सारांश"
              )}
            </h2>

            <p>
              {tr(
                "Final financial values for the invoice.",
                "इनव्हॉइससाठी अंतिम आर्थिक माहिती."
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
                "14px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Total Amount",
                "एकूण रक्कम"
              )}
            </span>

            <strong>
              {formatCurrency(
                safeTotal
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
                "14px 16px",
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
                safePaid
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
                "Balance",
                "बाकी रक्कम"
              )}
            </strong>

            <strong
              style={{
                color:
                  balanceAmount >
                  0
                    ? "#8a682d"
                    : "#304f35",
                fontSize:
                  "23px",
              }}
            >
              {formatCurrency(
                balanceAmount
              )}
            </strong>

          </div>

        </div>

      </section>


      {/* =================================
          REMARKS
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            03
          </span>

          <div>

            <h2>
              {tr(
                "Invoice Remarks",
                "इनव्हॉइस शेरा"
              )}
            </h2>

            <p>
              {tr(
                "Optional remarks for the invoice.",
                "इनव्हॉइससाठी ऐच्छिक शेरा."
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
            placeholder={tr(
              "Enter invoice remarks if required...",
              "आवश्यक असल्यास इनव्हॉइस शेरा प्रविष्ट करा..."
            )}
            rows={4}
          />

        </div>

      </section>


      {/* =================================
          IMPORTANT WORKFLOW
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding:
            "20px 24px",
          background:
            "#fffaf0",
          border:
            "1px solid #eadfbd",
        }}
      >

        <div
          style={{
            color:
              "#6c6044",
            fontSize:
              "12px",
            lineHeight:
              1.7,
          }}
        >

          <strong>
            {tr(
              "Important:",
              "महत्त्वाचे:"
            )}
          </strong>{" "}

          {tr(
            "Invoice confirmation completes the financial documentation stage. Physical room/bed locking is handled only after this stage.",
            "इनव्हॉइसची पुष्टी केल्यावर आर्थिक दस्तऐवजीकरणाचा टप्पा पूर्ण होतो. प्रत्यक्ष खोली / बेड लॉक या टप्प्यानंतरच केला जाईल."
          )}

        </div>

      </section>


      {/* =================================
          FOOTER
      ================================== */}

      <div className="booking-actions">

        <button
          type="button"
          className="secondary-action"
          onClick={
            onBack
          }
        >
          {tr(
            "BACK TO PAYMENT",
            "पेमेंटकडे मागे"
          )}
        </button>


        <button
          type="button"
          className="continue-booking-button"
          onClick={
            handleContinue
          }
        >
          {tr(
            "CONFIRM INVOICE →",
            "इनव्हॉइस निश्चित करा →"
          )}
        </button>

      </div>

    </main>
  );
}

export default Invoice;