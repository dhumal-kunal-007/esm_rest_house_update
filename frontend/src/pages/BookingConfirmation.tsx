import "../App.css";

import { useLanguage } from "../i18n/LanguageContext";

import type { Guest } from "./Booking";

import type {
  GuestTypeValue,
} from "./GuestType";

import type {
  RateResult,
  RateSelection,
} from "./Rate";

/* =================================
   TYPES
================================== */

export interface AcceptedAccommodation {
  roomId: string;

  roomName: string;

  roomCategory?: string;

  bedId?: string;

  bedNumber?: number;

  guestId: string;

  guestName: string;

  guestType?: GuestTypeValue;
}

export interface BookingConfirmationData {
  bookingType:
    | "CURRENT"
    | "ADVANCE";

  category: string;

  serviceman: {
    number: string;

    rank: string;

    name: string;

    address: string;
  };

  guests: Guest[];

  checkIn: string;

  checkOut: string;

  acceptedAccommodation: AcceptedAccommodation[];

  guestType: GuestTypeValue;

  rateSelection: RateSelection;

  rateResult: RateResult;
}

interface BookingConfirmationProps {
  officerName: string;

  booking: BookingConfirmationData;

  onBack: () => void;

  onConfirm: () => void;
}

/* =================================
   HELPERS
================================== */

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

const formatDateTime = (
  value: string
): string => {

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

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }
  );
};

/* =================================
   COMPONENT
================================== */

function BookingConfirmation({
  officerName,
  booking,
  onBack,
  onConfirm,
}: BookingConfirmationProps) {

  const {
    language,
    setLanguage,
  } = useLanguage();

  const isMarathi =
    language === "mr";

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
    booking.rateSelection.accommodationCategory === "DORMITORY"
      ? tr(
          "Selected separately for each guest",
          "प्रत्येक अतिथीसाठी स्वतंत्र निवड"
        )
      : booking.guestType === "ESM"
      ? tr(
          "ESM",
          "माजी सैनिक"
        )
      : booking.guestType ===
        "SERVING"
      ? tr(
          "Serving",
          "सेवारत"
        )
      : tr(
          "Civilian",
          "नागरिक"
        );

  const accommodationLabel =
    booking.rateSelection
      .accommodationCategory ===
    "AC"
      ? "AC"
      : booking.rateSelection
          .accommodationCategory ===
        "NON_AC"
      ? tr(
          "Non-AC",
          "नॉन-एसी"
        )
      : booking.rateSelection
          .accommodationCategory ===
        "DORMITORY"
      ? tr(
          "Dormitory",
          "वसतिगृह"
        )
      : booking.rateSelection
          .accommodationCategory ===
        "HALL"
      ? tr(
          "HALL",
          "हॉल"
        )
      : tr(
          "VIP",
          "व्हीआयपी"
        );

  const bookingTypeLabel =
    booking.bookingType ===
    "CURRENT"
      ? tr(
          "Current",
          "सध्याचे"
        )
      : tr(
          "Advance",
          "आगाऊ"
        );

  /* =================================
     ACCOMMODATION DISPLAY
  ================================== */


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
              "BOOKING",
              "बुकिंग"
            )}
          </span>

          <h1>
            {tr(
              "Booking Confirmation",
              "बुकिंग पुष्टीकरण"
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
            display: "flex",
            alignItems: "center",
            gap: "14px",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {languageSwitcher}

          <button
            type="button"
            className="availability-back-button"
            onClick={onBack}
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
          padding: "20px 24px",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >

          {[
            "01 REGISTRATION",
            "02 AVAILABILITY",
            "03 ACCEPTANCE",
            "04 GUEST TYPE",
            "05 RATE",
          ].map(
            (
              step,
              index
            ) => (
              <div
                key={step}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
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
                    fontWeight: 800,
                  }}
                >
                  {step}
                </span>

                {index <
                  4 && (
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
              fontWeight: 800,
            }}
          >
            06 BOOKING
          </span>

        </div>

      </section>


      {/* =================================
          CONFIRMATION NOTICE
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding: "24px 28px",
          background:
            "#f1f7ef",
          border:
            "1px solid #cadcc6",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems:
              "flex-start",
            gap: "16px",
          }}
        >

          <div
            style={{
              width: "44px",
              height: "44px",
              minWidth: "44px",
              borderRadius:
                "50%",
              background:
                "#355d3b",
              color:
                "#ffffff",
              display: "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              fontWeight: 900,
              fontSize: "20px",
            }}
          >
            ✓
          </div>

          <div>

            <h2
              style={{
                margin:
                  "0 0 6px",
                color:
                  "#304633",
                fontSize:
                  "19px",
              }}
            >
              {tr(
                "Review before creating the booking",
                "बुकिंग तयार करण्यापूर्वी माहिती तपासा"
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
                "The selected accommodation has been accepted. Verify all details below before creating the booking record.",
                "निवडलेले निवास स्वीकारले गेले आहे. बुकिंग रेकॉर्ड तयार करण्यापूर्वी खालील सर्व माहिती तपासा."
              )}
            </p>

          </div>

        </div>

      </section>


      {/* =================================
          BOOKING SUMMARY
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            06
          </span>

          <div>

            <h2>
              {tr(
                "Booking Summary",
                "बुकिंग सारांश"
              )}
            </h2>

            <p>
              {tr(
                "Basic booking information.",
                "बुकिंगची मूलभूत माहिती."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(4, minmax(0, 1fr))",
            gap: "14px",
          }}
        >

          <div
            style={{
              padding: "15px",
              border:
                "1px solid #dfe5dc",
              borderRadius: "10px",
              background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Booking Type",
                "बुकिंग प्रकार"
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
              {bookingTypeLabel}
            </strong>

          </div>


          <div
            style={{
              padding: "15px",
              border:
                "1px solid #dfe5dc",
              borderRadius: "10px",
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
              padding: "15px",
              border:
                "1px solid #dfe5dc",
              borderRadius: "10px",
              background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Accommodation",
                "निवास"
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
              {accommodationLabel}
            </strong>

          </div>


          <div
            style={{
              padding: "15px",
              border:
                "1px solid #dfe5dc",
              borderRadius: "10px",
              background:
                "#fafbf9",
            }}
          >

            <small>
              {tr(
                "Total",
                "एकूण"
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
                fontSize:
                  "17px",
              }}
            >
              {formatCurrency(
                booking.rateResult
                  .totalAmount
              )}
            </strong>

          </div>

        </div>

      </section>


      {/* =================================
          SERVICEMAN
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            01
          </span>

          <div>

            <h2>
              {tr(
                "Serviceman Information",
                "सैनिकांची माहिती"
              )}
            </h2>

            <p>
              {tr(
                "Registered serviceman details.",
                "नोंदणीकृत सैनिकांची माहिती."
              )}
            </p>

          </div>

        </div>


        <div className="booking-grid">

          <div className="form-field">

            <label>
              {tr(
                "Number",
                "क्रमांक"
              )}
            </label>

            <input
              value={
                booking.serviceman
                  .number
              }
              readOnly
            />

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Rank",
                "हुद्दा"
              )}
            </label>

            <input
              value={
                booking.serviceman
                  .rank
              }
              readOnly
            />

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Name",
                "नाव"
              )}
            </label>

            <input
              value={
                booking.serviceman
                  .name
              }
              readOnly
            />

          </div>


          <div className="form-field full">

            <label>
              {tr(
                "Address",
                "पत्ता"
              )}
            </label>

            <textarea
              value={
                booking.serviceman
                  .address
              }
              readOnly
              rows={3}
            />

          </div>

        </div>

      </section>


      {/* =================================
          STAY DETAILS
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            02
          </span>

          <div>

            <h2>
              {tr(
                "Stay Details",
                "मुक्काम तपशील"
              )}
            </h2>

            <p>
              {tr(
                "Confirmed duration and accommodation.",
                "निश्चित केलेला मुक्काम कालावधी आणि निवास."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "14px",
          }}
        >

          <div
            style={{
              padding: "17px",
              background:
                "#fafbf9",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
            }}
          >

            <small>
              {tr(
                "Check-In",
                "चेक-इन"
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
              {formatDateTime(
                booking.checkIn
              )}
            </strong>

          </div>


          <div
            style={{
              padding: "17px",
              background:
                "#fafbf9",
              border:
                "1px solid #dfe5dc",
              borderRadius:
                "10px",
            }}
          >

            <small>
              {tr(
                "Check-Out",
                "चेक-आउट"
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
              {formatDateTime(
                booking.checkOut
              )}
            </strong>

          </div>

        </div>

      </section>


      {/* =================================
          GUESTS
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            03
          </span>

          <div>

            <h2>
              {tr(
                "Guests / Occupants",
                "अतिथी / रहिवासी"
              )}
            </h2>

            <p>
              {booking.guests.length}{" "}
              {tr(
                "guest(s) registered.",
                "अतिथी नोंदणीकृत आहेत."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(2, minmax(0, 1fr))",
            gap: "14px",
          }}
        >

          {booking.guests.map(
            (
              guest,
              index
            ) => (

              <div
                key={
                  guest.id ??
                  index
                }
                style={{
                  padding:
                    "18px",
                  border:
                    "1px solid #dfe5dc",
                  borderRadius:
                    "11px",
                  background:
                    "#fafbf9",
                }}
              >

                <div
                  style={{
                    fontSize:
                      "11px",
                    fontWeight:
                      800,
                    color:
                      "#687467",
                    letterSpacing:
                      "1px",
                    textTransform:
                      "uppercase",
                  }}
                >
                  {tr(
                    "Guest",
                    "अतिथी"
                  )}{" "}
                  {index + 1}
                </div>


                <h3
                  style={{
                    margin:
                      "8px 0 10px",
                    color:
                      "#304633",
                  }}
                >
                  {guest.name}
                </h3>


                <div
                  style={{
                    display:
                      "grid",
                    gap:
                      "6px",
                    color:
                      "#687467",
                    fontSize:
                      "12px",
                  }}
                >

                  <div>
                    <strong>
                      {tr(
                        "Relationship:",
                        "नाते:"
                      )}
                    </strong>{" "}
                    {guest.relationship}
                  </div>

                  <div>
                    <strong>
                      {tr(
                        "Mobile:",
                        "मोबाईल:"
                      )}
                    </strong>{" "}
                    {guest.mobile}
                  </div>

                  <div>
                    <strong>
                      {tr(
                        "Relationship Proof:",
                        "नातेसंबंधाचा पुरावा:"
                      )}
                    </strong>{" "}
                    {
                      guest.relationshipProofType || "-"
                    }
                  </div>

                </div>

              </div>

            )
          )}

        </div>

      </section>


      {/* =================================
          ACCEPTED ACCOMMODATION
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            04
          </span>

          <div>

            <h2>
              {tr(
                "Accepted Accommodation",
                "स्वीकारलेले निवास"
              )}
            </h2>

            <p>
              {tr(
                "Room / bed selected during the acceptance stage.",
                "स्वीकृतीच्या टप्प्यात निवडलेली खोली / बेड."
              )}
            </p>

          </div>

        </div>


        {booking.acceptedAccommodation
          .length === 0 ? (

          <div
            style={{
              padding:
                "18px",
              border:
                "1px solid #e0e5de",
              borderRadius:
                "10px",
              background:
                "#fafbf9",
              color:
                "#697368",
            }}
          >
            {tr(
              "No accommodation selection is available.",
              "निवासाची कोणतीही निवड उपलब्ध नाही."
            )}
          </div>

        ) : (

          <div
            style={{
              display:
                "grid",
              gap:
                "10px",
            }}
          >

            {booking.acceptedAccommodation.map(
              (
                item,
                index
              ) => (

                <div
                  key={
                    `${item.roomId}-${item.bedId ?? index}`
                  }
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "space-between",
                    gap:
                      "15px",
                    padding:
                      "15px 17px",
                    border:
                      "1px solid #dfe5dc",
                    borderRadius:
                      "10px",
                    background:
                      "#fafbf9",
                  }}
                >

                  <div>

                    <strong
                      style={{
                        color:
                          "#304633",
                      }}
                    >
                      {item.roomName}
                    </strong>

                    <div
                      style={{
                        marginTop:
                          "5px",
                        fontSize:
                          "12px",
                        color:
                          "#707a6f",
                      }}
                    >
                      {item.bedNumber
                        ? `${tr(
                            "Bed",
                            "बेड"
                          )} ${
                            item.bedNumber
                          }`
                        : tr(
                            "Whole room",
                            "संपूर्ण खोली"
                          )}
                    </div>

                  </div>


                  <span
                    style={{
                      padding:
                        "6px 10px",
                      borderRadius:
                        "20px",
                      background:
                        "#e3f0e0",
                      color:
                        "#426047",
                      fontSize:
                        "10px",
                      fontWeight:
                        800,
                      letterSpacing:
                        "0.8px",
                    }}
                  >
                    ACCEPTED
                  </span>

                </div>

              )
            )}

          </div>

        )}

      </section>


      {/* =================================
          RATE SUMMARY
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            05
          </span>

          <div>

            <h2>
              {tr(
                "Rate Summary",
                "दराचा सारांश"
              )}
            </h2>

            <p>
              {tr(
                "Applicable charges before booking creation.",
                "बुकिंग तयार करण्यापूर्वी लागू शुल्क."
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
              gap:
                "15px",
              padding:
                "14px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Accommodation",
                "निवास"
              )}
              <small
                style={{
                  display: "block",
                  marginTop: "4px",
                  color: "#788176",
                }}
              >
                {booking.rateSelection.accommodationCategory === "AC" ||
                booking.rateSelection.accommodationCategory === "NON_AC"
                  ? `${booking.rateSelection.numberOfRooms} ${tr(
                      "room(s)",
                      "खोली"
                    )}`
                  : `${booking.rateSelection.numberOfBeds} ${tr(
                      "bed(s)",
                      "बेड"
                    )}`}{" "}
                × {booking.rateResult.accommodationDays}{" "}
                {tr("day(s)", "दिवस")} ×{" "}
                {formatCurrency(booking.rateResult.accommodationRate)}
              </small>
            </span>

            <strong>
              {formatCurrency(
                booking.rateResult
                  .accommodationAmount
              )}
            </strong>

          </div>

          {booking.rateSelection.accommodationCategory === "DORMITORY" &&
            booking.rateResult.bedRateDetails?.map((detail) => {
              const rateTypeLabel = detail.guestType === "ESM"
                ? "ESM"
                : detail.guestType === "SERVING"
                  ? tr("Serving", "सेवारत")
                  : tr("Civilian", "नागरिक");

              return (
                <div
                  key={`${detail.roomName}-${detail.bedNumber}-${detail.guestName}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "15px",
                    padding: "10px 16px",
                    borderBottom: "1px solid #e5e9e2",
                    background: "#fbfcfa",
                  }}
                >
                  <span>
                    {detail.roomName} · {tr("Bed", "बेड")} {detail.bedNumber} — {detail.guestName}
                    <small
                      style={{
                        display: "block",
                        marginTop: "4px",
                        color: "#788176",
                      }}
                    >
                      {detail.relationship} · {rateTypeLabel} · {formatCurrency(detail.dailyRate)} / {tr("night", "रात्र")} × {booking.rateResult.accommodationDays} {tr("day(s)", "दिवस")}
                    </small>
                  </span>
                  <strong>{formatCurrency(detail.stayAmount)}</strong>
                </div>
              );
            })}


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              gap:
                "15px",
              padding:
                "14px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Retired / ESM additional members",
                "माजी सैनिक / ESM अतिरिक्त सदस्य"
              )}
            </span>

            <strong>
              {formatCurrency(
                booking.rateResult
                  .additionalRetiredAmount
              )}
            </strong>

          </div>


          <div
            style={{
              display:
                "flex",
              justifyContent:
                "space-between",
              gap:
                "15px",
              padding:
                "14px 16px",
              borderBottom:
                "1px solid #e5e9e2",
            }}
          >

            <span>
              {tr(
                "Other relation additional members",
                "इतर नातेसंबंधातील अतिरिक्त सदस्य"
              )}
            </span>

            <strong>
              {formatCurrency(
                booking.rateResult
                  .additionalOtherRelationAmount
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
              gap:
                "15px",
              padding:
                "18px 16px",
                background:
                "#f1f7ef",
              borderRadius:
                "10px",
              marginTop:
                "5px",
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
                "Total Booking Amount",
                "एकूण बुकिंग रक्कम"
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
                booking.rateResult
                  .totalAmount
              )}
            </strong>

          </div>

        </div>

      </section>


      {/* =================================
          IMPORTANT FLOW NOTICE
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
            "Confirming this screen creates the booking record. It does not physically lock the room or bed. Physical room locking happens only after Booking Approval → Payment → Invoice.",
            "या स्क्रीनची पुष्टी केल्यावर बुकिंग रेकॉर्ड तयार होईल. यामुळे खोली किंवा बेड प्रत्यक्ष लॉक होणार नाही. प्रत्यक्ष रूम लॉक Booking Approval → Payment → Invoice नंतरच होईल."
          )}

        </div>

      </section>


      {/* =================================
          FOOTER ACTIONS
      ================================== */}

      <div className="booking-actions">

        <button
          type="button"
          className="secondary-action"
          onClick={onBack}
        >
          {tr(
            "BACK TO RATE",
            "दराकडे मागे"
          )}
        </button>


        <button
          type="button"
          className="continue-booking-button"
          onClick={onConfirm}
        >
          {tr(
            "CONFIRM & CREATE BOOKING →",
            "पुष्टी करा आणि बुकिंग तयार करा →"
          )}
        </button>

      </div>

    </main>
  );
}

export default BookingConfirmation;