import {
  useState,
} from "react";

import "../App.css";

import type {
  AccommodationCategory,
} from "../App";

import { useLanguage } from "../i18n/LanguageContext";

/* =================================
   CONSTANTS
================================== */

const relationshipOptions = [
  "SELF",
  "WIFE",
  "SON",
  "DAUGHTER",
  "MOTHER",
  "FATHER",
  "OTHER",
] as const;

const relationshipProofOptions = [
  "DEPARTMENT CARD",
  "AADHAAR CARD",
  "PAN CARD",
  "DEPENDENT CARD",
  "WIDOW CARD",
  "CANTEEN CARD",
  "ECHS CARD",
];

const STANDARD_CHECK_IN_TIME = "13:00";
const STANDARD_CHECK_OUT_TIME = "13:00";

/* =================================
   TYPES
================================== */

export interface Guest {
  id?: string;

  name: string;
  gender: string;
  actualGender: string;

  relationship: string;

  mobile: string;
  address: string;

  relationshipProofType: string;

  relationshipProofNumber: string;

  aadhaar: string;

  document?: File | null;
}

/* =================================
   BOOKING DRAFT
================================== */

export interface BookingDraft {
  id?: string;

  category: AccommodationCategory;

  bookingType:
    | "CURRENT"
    | "ADVANCE";

  serviceman: {
    number: string;
    rank: string;
    name: string;
    mobile: string;
    address: string;
    aadhaar: string;
    document?: File | null;
  };

  guests: Guest[];

  checkIn: string;

  checkOut: string;

}

/* =================================
   PROPS
================================== */

interface BookingProps {
  category: AccommodationCategory;
  initialBooking?: BookingDraft | null;

  officerName: string;

  userId: string;

  onBack: () => void;

  onContinue: (
    booking: BookingDraft
  ) => void;
}

/* =================================
   DATE HELPERS
================================== */

const getTodayDate = (): string => {
  const now = new Date();

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

const getTomorrowDate = (): string => {
  const tomorrow =
    new Date();

  tomorrow.setDate(
    tomorrow.getDate() + 1
  );

  const year =
    tomorrow.getFullYear();

  const month =
    String(
      tomorrow.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      tomorrow.getDate()
    ).padStart(
      2,
      "0"
    );

  return `${year}-${month}-${day}`;
};

const createDateTime = (
  date: string,
  time: string
): string => {
  return `${date}T${time}`;
};

const getDatePart = (
  value: string
): string => {
  if (!value) {
    return "";
  }

  return value.slice(
    0,
    10
  );
};

/* =================================
   EMPTY GUEST
================================== */

const createEmptyGuest =
  (): Guest => ({
    id: undefined,

    name: "",

    gender: "",
    actualGender: "",

    relationship: "",

    mobile: "",
    address: "",

    relationshipProofType: "",

    relationshipProofNumber: "",

    aadhaar: "",

    document: null,
  });

/* =================================
   COMPONENT
================================== */

function Booking({
  category,
  initialBooking,
  officerName,
  userId: _userId,
  onBack,
  onContinue,
}: BookingProps) {

  const {
    language,
    setLanguage,
  } = useLanguage();

  const isMarathi =
    language === "mr";

  /* =================================
     TRANSLATION HELPER
  ================================== */

  const tr = (
    english: string,
    marathi: string
  ) =>
    isMarathi
      ? marathi
      : english;

  /* =================================
     CURRENT DATE
  ================================== */

  const today =
    getTodayDate();

  const tomorrow =
    getTomorrowDate();

  /* =================================
     BOOKING TYPE
  ================================== */

  const [
    bookingType,
    setBookingType,
  ] = useState<
    "CURRENT" | "ADVANCE"
  >(initialBooking?.bookingType ?? "CURRENT");

  /* =================================
     SERVICEMAN
  ================================== */

  const [
    serviceman,
    setServiceman,
  ] = useState<BookingDraft["serviceman"]>(
    initialBooking?.serviceman ?? {
      number: "",
      rank: "",
      name: "",
      mobile: "",
      address: "",
      aadhaar: "",
      document: null,
    }
  );

  /* =================================
     GUEST COUNT
  ================================== */

  const [
    guestCount,
    setGuestCount,
  ] = useState(initialBooking?.guests.length ?? 1);
  const [guestCountInput, setGuestCountInput] = useState(
    String(initialBooking?.guests.length ?? 1)
  );

  /* =================================
     GUESTS
  ================================== */

  const [
    guests,
    setGuests,
  ] = useState<Guest[]>(
    initialBooking?.guests ?? [createEmptyGuest()]
  );

  /* =================================
     DURATION
  ================================== */

  const [
    checkIn,
    setCheckIn,
  ] = useState(
    initialBooking?.checkIn ??
      createDateTime(
        today,
        STANDARD_CHECK_IN_TIME
      )
  );

  const [
    checkOut,
    setCheckOut,
  ] = useState(initialBooking?.checkOut ?? "");
  const [checkInError, setCheckInError] = useState("");
  const [checkOutError, setCheckOutError] = useState("");
  const [validationMessage, setValidationMessage] = useState("");

  const showValidationMessage = (message: string) => {
    setValidationMessage(message);
  };


  /* =================================
     CATEGORY LABEL
  ================================== */

  const categoryLabel =
    category === "AC"
      ? "AC"
      : category === "Non-AC"
      ? tr("Non-AC", "नॉन-एसी")
      : category === "Dormitory"
      ? tr("Dormitory", "वसतिगृह")
      : tr("VIP", "व्हीआयपी");

  /* =================================
     LANGUAGE SWITCH
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
     BOOKING TYPE CHANGE
  ================================== */

  const handleBookingTypeChange = (
    newType:
      | "CURRENT"
      | "ADVANCE"
  ) => {
    setValidationMessage("");
    setBookingType(
      newType
    );

    if (
      newType ===
      "CURRENT"
    ) {
      setCheckIn(
        createDateTime(
          today,
          STANDARD_CHECK_IN_TIME
        )
      );

      setCheckOut("");
      setCheckInError("");
      setCheckOutError("");

      return;
    }

    setCheckIn(
      createDateTime(
        tomorrow,
        STANDARD_CHECK_IN_TIME
      )
    );

    setCheckOut("");
    setCheckInError("");
    setCheckOutError("");
  };

  /* =================================
     SERVICEMAN UPDATE
  ================================== */

  const updateServiceman = (
    field: keyof typeof serviceman,
    value: string
  ) => {
    setServiceman(
      (current) => ({
        ...current,
        [field]: value,
      })
    );
    setGuests((current) =>
      current.map((guest) =>
        guest.relationship === "SELF"
          ? {
              ...guest,
              ...(field === "name" ? { name: value } : {}),
              ...(field === "mobile" ? { mobile: value } : {}),
              ...(field === "address" ? { address: value } : {}),
              ...(field === "aadhaar" ? { aadhaar: value } : {}),
            }
          : guest
      )
    );
  };

  /* =================================
     GUEST COUNT CHANGE
  ================================== */

  const handleGuestCountChange = (
    value: string
  ) => {
    setGuestCountInput(value);

    if (!value) {
      return;
    }

    const parsedCount = Number(value);
    if (!Number.isFinite(parsedCount)) {
      return;
    }

    const count =
      Math.max(
        1,
        Math.min(
          10,
          parsedCount
        )
      );

    setGuestCountInput(String(count));
    setGuestCount(
      count
    );

    setGuests(
      (current) => {
        const updated = [
          ...current,
        ];

        while (
          updated.length <
          count
        ) {
          updated.push(
            createEmptyGuest()
          );
        }

        return updated.slice(
          0,
          count
        );
      }
    );
  };

  const handleAddGuest = () => {
    if (guestCount >= 10) {
      return;
    }
    handleGuestCountChange(String(guestCount + 1));
  };

  /* =================================
     GUEST UPDATE
  ================================== */

  const updateGuest = (
    index: number,
    field: keyof Guest,
    value: string
  ) => {
    setGuests(
      (current) =>
        current.map(
          (
            guest,
            guestIndex
          ) => {
            if (
              guestIndex !==
              index
            ) {
              return guest;
            }

            if (field === "gender") {
              return {
                ...guest,
                gender: value,
                actualGender:
                  value === "MALE" || value === "FEMALE"
                    ? value
                    : guest.actualGender,
              };
            }

            if (
              field ===
              "relationship"
            ) {
              if (value === "SELF") {
                return {
                  ...guest,
                  relationship: value,
                  name: serviceman.name,
                  mobile: serviceman.mobile,
                  address: serviceman.address,
                  aadhaar: serviceman.aadhaar,
                  relationshipProofType: "",
                  relationshipProofNumber: "",
                };
              }

              return {
                ...guest,

                relationship:
                  value,

                relationshipProofType:
                  "",

                relationshipProofNumber:
                  "",

              };
            }

            return {
              ...guest,
              [field]:
                value,
            };
          }
        )
    );
  };

  /* =================================
     RELATIONSHIP PROOF TYPE
  ================================== */

  const updateRelationshipProofType = (
    index: number,
    value: string
  ) => {
    setGuests(
      (current) =>
        current.map(
          (
            guest,
            guestIndex
          ) =>
            guestIndex ===
            index
              ? {
                  ...guest,

                  relationshipProofType:
                    value,
                }
              : guest
        )
    );
  };

  /* =================================
     RELATIONSHIP PROOF NUMBER
  ================================== */

  const updateRelationshipProofNumber = (
    index: number,
    value: string
  ) => {
    setGuests(
      (current) =>
        current.map(
          (
            guest,
            guestIndex
          ) =>
            guestIndex ===
            index
              ? {
                  ...guest,

                  relationshipProofNumber:
                    value,
                }
              : guest
        )
    );
  };

  /* =================================
     CHECK-IN DATE CHANGE
  ================================== */

  const handleCheckInChange = (
    value: string
  ) => {
    const selectedValue = value
      ? createDateTime(
          getDatePart(value),
          STANDARD_CHECK_IN_TIME
        )
      : "";
    const selectedDate =
      getDatePart(
        selectedValue
      );

    if (
      value &&
      bookingType ===
      "CURRENT" &&
      selectedDate !==
      today
    ) {
      setCheckIn(selectedValue);
      setCheckInError(
        tr(
          `CURRENT booking must start today (${today}).`,
          `CURRENT बुकिंग आजच्या तारखेपासूनच सुरू झाली पाहिजे (${today}).`
        )
      );
      return;
    }

    if (
      value &&
      bookingType ===
      "ADVANCE" &&
      selectedDate <=
      today
    ) {
      setCheckIn(selectedValue);
      setCheckInError(
        tr(
          `ADVANCE booking must start from tomorrow (${tomorrow}) or later.`,
          `ADVANCE बुकिंग उद्यापासून (${tomorrow}) किंवा त्यानंतरची असली पाहिजे.`
        )
      );
      return;
    }

    setCheckIn(selectedValue);
    setCheckInError("");

    if (
      checkOut &&
      getDatePart(checkOut) <
      getDatePart(selectedValue)
    ) {
      setCheckOut("");
      setCheckOutError("");
    }
  };

  /* =================================
     CHECK-OUT DATE CHANGE
  ================================== */

  const handleCheckOutChange = (
    value: string
  ) => {
    const selectedValue = value
      ? createDateTime(
          getDatePart(value),
          STANDARD_CHECK_OUT_TIME
        )
      : "";

    if (
      selectedValue &&
      checkIn &&
      getDatePart(selectedValue) <
      getDatePart(checkIn)
    ) {
      setCheckOut(selectedValue);
      setCheckOutError(
        tr(
          "Check-out date cannot be before check-in date.",
          "चेक-आउटची तारीख चेक-इनच्या तारखेच्या आधीची असू शकत नाही."
        )
      );
      return;
    }

    setCheckOut(selectedValue);
    setCheckOutError("");
  };

  /* =================================
     FORM VALIDATION
  ================================== */

  const validateForm = () => {

    if (
      !serviceman.number ||
      !serviceman.rank ||
      !serviceman.name ||
      !serviceman.mobile ||
      !serviceman.address ||
      (!serviceman.aadhaar && !initialBooking?.id)
    ) {
      showValidationMessage(
        tr(
          "Please complete all Serving / Ex-Servicemen details.",
          "कृपया सेवा बजावत असलेले / माजी सैनिक यांची सर्व माहिती पूर्ण करा."
        )
      );

      return false;
    }

    if (!/^\d{10}$/.test(serviceman.mobile)) {
      showValidationMessage(
        tr(
          "The booking person's mobile number must contain exactly 10 digits.",
          "बुकिंग व्यक्तीचा मोबाईल क्रमांक नेमका १० अंकांचा असावा."
        )
      );
      return false;
    }

    if (!serviceman.document && !initialBooking?.id) {
      showValidationMessage(
        tr(
          "Please upload the booking person's ID document.",
          "कृपया बुकिंग व्यक्तीचे ओळखपत्र अपलोड करा."
        )
      );
      return false;
    }

    if (
      serviceman.aadhaar &&
      !/^\d{12}$/.test(serviceman.aadhaar)
    ) {
      showValidationMessage(tr(
        "The booking person's Aadhaar number must contain exactly 12 digits.",
        "बुकिंग व्यक्तीचा आधार क्रमांक नेमका १२ अंकांचा असावा."
      ));
      return false;
    }

    if (
      !checkIn ||
      !checkOut
    ) {
      showValidationMessage(
        tr(
          "Please enter check-in and check-out dates.",
          "कृपया चेक-इन आणि चेक-आउटच्या तारखा प्रविष्ट करा."
        )
      );

      return false;
    }

    const selectedCheckInDate =
      getDatePart(
        checkIn
      );

    const selectedCheckOutDate =
      getDatePart(
        checkOut
      );

    if (
      bookingType ===
      "CURRENT" &&
      selectedCheckInDate !==
      today
    ) {
      showValidationMessage(
        tr(
          `CURRENT booking must start today (${today}).`,
          `CURRENT बुकिंग आजच्या तारखेपासूनच सुरू झाली पाहिजे (${today}).`
        )
      );

      return false;
    }

    if (
      bookingType ===
      "ADVANCE" &&
      selectedCheckInDate <=
      today
    ) {
      showValidationMessage(
        tr(
          `ADVANCE booking must start from tomorrow (${tomorrow}) or later.`,
          `ADVANCE बुकिंग उद्यापासून (${tomorrow}) किंवा त्यानंतरची असली पाहिजे.`
        )
      );

      return false;
    }

    if (
      !selectedCheckOutDate
    ) {
      showValidationMessage(
        tr(
          "Please enter a valid check-out date.",
          "कृपया वैध चेक-आउट तारीख प्रविष्ट करा."
        )
      );

      return false;
    }

    if (selectedCheckOutDate < selectedCheckInDate) {
      showValidationMessage(
        tr(
          "Check-out date cannot be before check-in date.",
          "चेक-आउटची तारीख चेक-इनच्या तारखेच्या आधीची असू शकत नाही."
        )
      );

      return false;
    }

    for (
      let i = 0;
      i < guests.length;
      i++
    ) {
      const guest =
        guests[i];

      if (!guest.gender) {
        showValidationMessage(
          tr(
            `Please select a gender for Guest ${i + 1}.`,
            `कृपया अतिथी ${i + 1} साठी लिंग निवडा.`
          )
        );
        return false;
      }

      if (
        ["CHILD", "GUEST"].includes(guest.gender) &&
        !["MALE", "FEMALE"].includes(guest.actualGender)
      ) {
        showValidationMessage(
          tr(
            `Please select the actual gender for Guest ${i + 1}.`,
            `कृपया अतिथी ${i + 1} साठी वास्तविक लिंग निवडा.`
          )
        );
        return false;
      }

      if (
        !guest.name ||
        !guest.relationship ||
        !guest.mobile ||
        (!guest.aadhaar && !guest.id) ||
        (!guest.document && !guest.id)
      ) {
        showValidationMessage(
          tr(
            `Complete identity details and upload a document for Guest ${i + 1}.`,
            `अतिथी ${i + 1} ची ओळख माहिती पूर्ण करून दस्तऐवज अपलोड करा.`
          )
        );

        return false;
      }

      if (!/^\d{10}$/.test(guest.mobile)) {
        showValidationMessage(tr(
          `Guest ${i + 1} mobile number must contain exactly 10 digits.`,
          `अतिथी ${i + 1} चा मोबाईल क्रमांक नेमका १० अंकांचा असावा.`
        ));
        return false;
      }

      if (
        guest.aadhaar &&
        !/^\d{12}$/.test(guest.aadhaar)
      ) {
        showValidationMessage(tr(
          `Guest ${i + 1} Aadhaar number must contain exactly 12 digits.`,
          `अतिथी ${i + 1} चा आधार क्रमांक नेमका १२ अंकांचा असावा.`
        ));
        return false;
      }

      if (
        guest.relationship !==
          "SELF" &&
        (
          !guest.relationshipProofType ||
          !guest.relationshipProofNumber
        )
      ) {
        showValidationMessage(
          tr(
            `Please complete relationship proof details for Guest ${i + 1}.`,
            `कृपया अतिथी ${i + 1} साठी नातेसंबंधाच्या पुराव्याची माहिती पूर्ण करा.`
          )
        );

        return false;
      }
    }


    return true;
  };

  /* =================================
     CONTINUE
  ================================== */

  const handleContinue = () => {
    if (
      !validateForm()
    ) {
      return;
    }

    onContinue({
      id: initialBooking?.id,

      category,

      bookingType,

      serviceman,

      guests,

      checkIn,

      checkOut,

    });
  };

  /* =================================
     UI
  ================================== */

  return (
    <main
      className="booking-screen"
      onChangeCapture={() => setValidationMessage("")}
    >

      {/* =================================
          HEADER
      ================================== */}

      <header className="booking-header">

        <div>

          <span className="section-label">
            {tr(
              "NEW BOOKING",
              "नवीन बुकिंग"
            )}
          </span>

          <h1>
            {tr(
              "Accommodation Booking Form",
              "निवास बुकिंग फॉर्म"
            )}
          </h1>

          <p>
            {categoryLabel}
            {" • "}
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

      {validationMessage && (
        <div
          className="booking-validation-message"
          role="alert"
          aria-live="polite"
        >
          {validationMessage}
        </div>
      )}

      {/* =================================
          BOOKING TYPE
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding: "0",
          overflow: "hidden",
        }}
      >

        <div
          style={{
            padding:
              "24px 28px 18px",
            borderBottom:
              "1px solid #e2e7df",
          }}
        >

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent:
                "space-between",
              gap: "20px",
              flexWrap:
                "wrap",
            }}
          >

            <div>

              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing:
                    "1.8px",
                  color:
                    "#6f796c",
                  textTransform:
                    "uppercase",
                  marginBottom:
                    "6px",
                }}
              >
                {tr(
                  "Booking Type",
                  "बुकिंगचा प्रकार"
                )}
              </div>

              <div
                style={{
                  fontSize: "13px",
                  color:
                    "#747d72",
                }}
              >
                {tr(
                  "Select whether the guest is staying now or making a future reservation.",
                  "अतिथी सध्या मुक्काम करणार आहे की भविष्यासाठी आरक्षण करणार आहे ते निवडा."
                )}
              </div>

            </div>


            <div
              style={{
                display: "flex",
                alignItems:
                  "center",
                gap: "8px",
                padding:
                  "5px",
                background:
                  "#f1f4ef",
                border:
                  "1px solid #dce3d8",
                borderRadius:
                  "12px",
              }}
            >

              <button
                type="button"
                onClick={() =>
                  handleBookingTypeChange(
                    "CURRENT"
                  )
                }
                style={{
                  border:
                    bookingType ===
                    "CURRENT"
                      ? "1px solid #355d3b"
                      : "1px solid transparent",
                  background:
                    bookingType ===
                    "CURRENT"
                      ? "#355d3b"
                      : "transparent",
                  color:
                    bookingType ===
                    "CURRENT"
                      ? "#ffffff"
                      : "#52604f",
                  borderRadius:
                    "9px",
                  padding:
                    "12px 22px",
                  fontSize:
                    "12px",
                  fontWeight:
                    800,
                  letterSpacing:
                    "1px",
                  cursor:
                    "pointer",
                  minWidth:
                    "125px",
                  transition:
                    "all 0.2s ease",
                }}
              >
                {bookingType ===
                  "CURRENT" &&
                  "✓ "}

                {tr(
                  "CURRENT",
                  "सध्याचे"
                )}
              </button>


              <button
                type="button"
                onClick={() =>
                  handleBookingTypeChange(
                    "ADVANCE"
                  )
                }
                style={{
                  border:
                    bookingType ===
                    "ADVANCE"
                      ? "1px solid #355d3b"
                      : "1px solid transparent",
                  background:
                    bookingType ===
                    "ADVANCE"
                      ? "#355d3b"
                      : "transparent",
                  color:
                    bookingType ===
                    "ADVANCE"
                      ? "#ffffff"
                      : "#52604f",
                  borderRadius:
                    "9px",
                  padding:
                    "12px 22px",
                  fontSize:
                    "12px",
                  fontWeight:
                    800,
                  letterSpacing:
                    "1px",
                  cursor:
                    "pointer",
                  minWidth:
                    "125px",
                  transition:
                    "all 0.2s ease",
                }}
              >
                {bookingType ===
                  "ADVANCE" &&
                  "✓ "}

                {tr(
                  "ADVANCE",
                  "आगाऊ"
                )}
              </button>

            </div>

          </div>

        </div>


        {/* =================================
            TYPE INFORMATION
        ================================== */}

        <div
          style={{
            padding:
              "18px 28px 22px",
            background:
              "#fbfcfa",
          }}
        >

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, minmax(0, 1fr))",
              gap: "14px",
            }}
          >

            <div
              onClick={() =>
                handleBookingTypeChange(
                  "CURRENT"
                )
              }
              style={{
                border:
                  bookingType ===
                  "CURRENT"
                    ? "1px solid #4f7654"
                    : "1px solid #dfe5dc",
                background:
                  bookingType ===
                  "CURRENT"
                    ? "#f2f7f1"
                    : "#ffffff",
                borderRadius:
                  "10px",
                padding:
                  "15px 17px",
                cursor:
                  "pointer",
                transition:
                  "all 0.2s ease",
              }}
            >

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  gap: "10px",
                  marginBottom:
                    "7px",
                }}
              >

                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    borderRadius:
                      "50%",
                    background:
                      bookingType ===
                      "CURRENT"
                        ? "#355d3b"
                        : "#e8ede6",
                    color:
                      bookingType ===
                      "CURRENT"
                        ? "#ffffff"
                        : "#647060",
                    fontWeight:
                      800,
                    fontSize:
                      "13px",
                  }}
                >
                  {bookingType ===
                  "CURRENT"
                    ? "✓"
                    : "1"}
                </span>

                <strong
                  style={{
                    fontSize:
                      "14px",
                    color:
                      "#304633",
                  }}
                >
                  {tr(
                    "CURRENT",
                    "सध्याचे"
                  )}
                </strong>

              </div>

              <div
                style={{
                  fontSize:
                    "12px",
                  color:
                    "#697368",
                  lineHeight:
                    "1.5",
                }}
              >
                {tr(
                  "Stay starts today. The allotted room/bed will represent the current stay.",
                  "मुक्काम आजपासून सुरू होतो. दिलेली खोली/बेड सध्याच्या मुक्कामासाठी असेल."
                )}
              </div>

              <div
                style={{
                  marginTop:
                    "9px",
                  fontSize:
                    "11px",
                  fontWeight:
                    800,
                  letterSpacing:
                    "0.8px",
                  color:
                    "#4b654d",
                }}
              >
                {tr(
                  "CHECK-IN",
                  "चेक-इन"
                )}: {today}
              </div>

            </div>


            <div
              onClick={() =>
                handleBookingTypeChange(
                  "ADVANCE"
                )
              }
              style={{
                border:
                  bookingType ===
                  "ADVANCE"
                    ? "1px solid #4f7654"
                    : "1px solid #dfe5dc",
                background:
                  bookingType ===
                  "ADVANCE"
                    ? "#f2f7f1"
                    : "#ffffff",
                borderRadius:
                  "10px",
                padding:
                  "15px 17px",
                cursor:
                  "pointer",
                transition:
                  "all 0.2s ease",
              }}
            >

              <div
                style={{
                  display: "flex",
                  alignItems:
                    "center",
                  gap: "10px",
                  marginBottom:
                    "7px",
                }}
              >

                <span
                  style={{
                    width: "28px",
                    height: "28px",
                    display:
                      "inline-flex",
                    alignItems:
                      "center",
                    justifyContent:
                      "center",
                    borderRadius:
                      "50%",
                    background:
                      bookingType ===
                      "ADVANCE"
                        ? "#355d3b"
                        : "#e8ede6",
                    color:
                      bookingType ===
                      "ADVANCE"
                        ? "#ffffff"
                        : "#647060",
                    fontWeight:
                      800,
                    fontSize:
                      "13px",
                  }}
                >
                  {bookingType ===
                  "ADVANCE"
                    ? "✓"
                    : "2"}
                </span>

                <strong
                  style={{
                    fontSize:
                      "14px",
                    color:
                      "#304633",
                  }}
                >
                  {tr(
                    "ADVANCE",
                    "आगाऊ"
                  )}
                </strong>

              </div>

              <div
                style={{
                  fontSize:
                    "12px",
                  color:
                    "#697368",
                  lineHeight:
                    "1.5",
                }}
              >
                {tr(
                  "Future reservation. The allotted room/bed will remain booked until the stay begins.",
                  "भविष्यातील आरक्षण. मुक्काम सुरू होईपर्यंत दिलेली खोली/बेड आरक्षित राहील."
                )}
              </div>

              <div
                style={{
                  marginTop:
                    "9px",
                  fontSize:
                    "11px",
                  fontWeight:
                    800,
                  letterSpacing:
                    "0.8px",
                  color:
                    "#4b654d",
                }}
              >
                {tr(
                  "CHECK-IN",
                  "चेक-इन"
                )}: {tomorrow}{" "}
                {tr(
                  "OR LATER",
                  "किंवा त्यानंतर"
                )}
              </div>

            </div>

          </div>

        </div>

      </section>


      {/* =================================
          SECTION 1
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            01
          </span>

          <div>

            <h2>
              {tr(
                "Serving / Ex-Servicemen Information",
                "सेवारत / माजी सैनिकांची माहिती"
              )}
            </h2>

            <p>
              {tr(
                "Enter the details of the serviceman.",
                "सैनिकाची माहिती प्रविष्ट करा."
              )}
            </p>

          </div>

        </div>


        <div className="booking-grid">

          <div className="form-field">

            <label>
              {tr(
                "Number *",
                "क्रमांक *"
              )}
            </label>

            <input
              value={
                serviceman.number
              }
              onChange={(e) =>
                updateServiceman(
                  "number",
                  e.target.value
                )
              }
              placeholder={tr(
                "Service / Registration No.",
                "सेवा / नोंदणी क्रमांक"
              )}
            />

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Rank *",
                "हुद्दा *"
              )}
            </label>

            <input
              value={
                serviceman.rank
              }
              onChange={(e) =>
                updateServiceman(
                  "rank",
                  e.target.value
                )
              }
              placeholder={tr(
                "Rank",
                "हुद्दा"
              )}
            />

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Name *",
                "नाव *"
              )}
            </label>

            <input
              value={
                serviceman.name
              }
              onChange={(e) =>
                updateServiceman(
                  "name",
                  e.target.value
                )
              }
              placeholder={tr(
                "Full name",
                "पूर्ण नाव"
              )}
            />

          </div>


          <div className="form-field full">

            <label>
              {tr(
                "Address *",
                "पत्ता *"
              )}
            </label>

            <textarea
              value={
                serviceman.address
              }
              onChange={(e) =>
                updateServiceman(
                  "address",
                  e.target.value
                )
              }
              placeholder={tr(
                "Complete address",
                "पूर्ण पत्ता"
              )}
              rows={3}
            />

          </div>

          <div className="form-field">
            <label>{tr("Mobile Number *", "मोबाईल क्रमांक *")}</label>
            <input
              inputMode="numeric"
              maxLength={10}
              value={serviceman.mobile}
              onChange={(event) =>
                updateServiceman(
                  "mobile",
                  event.target.value.replace(/\D/g, "")
                )
              }
              placeholder={tr("10-digit mobile number", "१० अंकी मोबाईल क्रमांक")}
            />
          </div>


          <div className="form-field">
            <label>{tr("Aadhaar Number *", "आधार क्रमांक *")}</label>
            <input
              inputMode="numeric"
              maxLength={12}
              value={serviceman.aadhaar}
              onChange={(e) =>
                updateServiceman("aadhaar", e.target.value.replace(/\D/g, ""))
              }
              placeholder="12 digits"
            />
          </div>

          <div className="form-field">
            <label>{tr("Booking person's ID document *", "बुकिंग व्यक्तीचे ओळखपत्र *")}</label>
            <input
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (file && file.size > 5 * 1024 * 1024) {
                  showValidationMessage(tr("Each document must be 5 MB or smaller.", "प्रत्येक दस्तऐवज ५ MB किंवा त्यापेक्षा कमी असावा."));
                  event.target.value = "";
                  return;
                }
                setServiceman((current) => ({ ...current, document: file }));
              }}
            />
          </div>

        </div>

      </section>


      {/* =================================
          SECTION 2
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            02
          </span>

          <div>

            <h2>
              {tr(
                "Guest / Occupant Information",
                "अतिथी / रहिवासी माहिती"
              )}
            </h2>

            <p>
              {tr(
                "Enter the details of every person staying.",
                "मुक्काम करणाऱ्या प्रत्येक व्यक्तीची माहिती प्रविष्ट करा."
              )}
            </p>

          </div>

        </div>


        <div className="guest-count">

          <label>
            {tr(
              "Number of Guests / Occupants *",
              "अतिथी / रहिवाशांची संख्या *"
            )}
          </label>

          <input
            type="number"
            min="1"
            max="10"
            value={guestCountInput}
            onChange={(event) =>
              handleGuestCountChange(event.target.value)
            }
            onBlur={() => {
              if (!guestCountInput) {
                setGuestCountInput(String(guestCount));
              }
            }}
          />

          <span>
            {guestCount === 1
              ? tr(
                  "1 guest will be included",
                  "१ अतिथी समाविष्ट असेल"
                )
              : `${guestCount} ${tr(
                  "guests will be included",
                  "अतिथी समाविष्ट असतील"
                )}`}
          </span>

          <button
            type="button"
            className="add-guest-button"
            onClick={handleAddGuest}
            disabled={guestCount >= 10}
          >
            {tr("ADD GUEST / OCCUPANT +", "अतिथी / रहिवासी जोडा +")}
          </button>

        </div>


        {guests.map(
          (
            guest,
            index
          ) => (

            <div
              className="guest-card"
              key={index}
            >

              <h3>
                {tr(
                  "Guest / Occupant",
                  "अतिथी / रहिवासी"
                )}{" "}
                {index + 1}
              </h3>


              <div className="booking-grid">

                {/* NAME */}

                <div className="form-field">

                  <label>
                    {tr(
                      "Name *",
                      "नाव *"
                    )}
                  </label>

                  <input
                    value={
                      guest.name
                    }
                    onChange={(e) =>
                      updateGuest(
                        index,
                        "name",
                        e.target.value
                      )
                    }
                    placeholder={tr(
                      "Guest name",
                      "अतिथीचे नाव"
                    )}
                  />

                </div>

                <div className="form-field">
                  <label>
                    {tr("Gender *", "लिंग *")}
                  </label>
                  <select
                    value={guest.gender}
                    onChange={(event) =>
                      updateGuest(index, "gender", event.target.value)
                    }
                    required
                  >
                    <option value="">
                      {tr("Select gender", "लिंग निवडा")}
                    </option>
                    <option value="MALE">
                      {tr("Male", "पुरुष")}
                    </option>
                    <option value="FEMALE">
                      {tr("Female", "महिला")}
                    </option>
                    <option value="CHILD">
                      {tr("Child", "बालक")}
                    </option>
                    <option value="GUEST">
                      {tr("Guest (Other)", "अतिथी (इतर)")}
                    </option>
                  </select>
                </div>
                {["CHILD", "GUEST"].includes(guest.gender) && (
                  <div className="form-field">
                    <label>{tr("Actual Gender *", "वास्तविक लिंग *")}</label>
                    <select
                      value={guest.actualGender}
                      onChange={(event) =>
                        updateGuest(index, "actualGender", event.target.value)
                      }
                      required
                    >
                      <option value="">{tr("Select actual gender", "वास्तविक लिंग निवडा")}</option>
                      <option value="MALE">{tr("Male", "पुरुष")}</option>
                      <option value="FEMALE">{tr("Female", "महिला")}</option>
                    </select>
                  </div>
                )}

                <div className="form-field full">
                  <label>{tr("Address", "पत्ता")}</label>
                  <textarea
                    rows={2}
                    value={guest.address}
                    onChange={(event) =>
                      updateGuest(index, "address", event.target.value)
                    }
                    placeholder={tr("Guest address", "अतिथीचा पत्ता")}
                  />
                </div>


                {/* RELATIONSHIP */}

                <div className="form-field">

                  <label>
                    {tr(
                      "Relationship with Soldier *",
                      "सैनिकाशी नाते *"
                    )}
                  </label>

                  <select
                    value={
                      guest.relationship
                    }
                    onChange={(e) =>
                      updateGuest(
                        index,
                        "relationship",
                        e.target.value
                      )
                    }
                  >

                    <option value="">
                      {tr(
                        "Select relationship",
                        "नाते निवडा"
                      )}
                    </option>

                    {relationshipOptions.map(
                      (
                        relationship
                      ) => {

                        const relationshipLabel =
                          relationship === "SELF"
                            ? tr(
                                "SELF",
                                "स्वतः"
                              )
                            : relationship === "WIFE"
                            ? tr(
                                "WIFE",
                                "पत्नी"
                              )
                            : relationship === "SON"
                            ? tr(
                                "SON",
                                "मुलगा"
                              )
                            : relationship === "DAUGHTER"
                            ? tr(
                                "DAUGHTER",
                                "मुलगी"
                              )
                            : relationship === "MOTHER"
                            ? tr(
                                "MOTHER",
                                "आई"
                              )
                            : relationship === "FATHER"
                            ? tr(
                                "FATHER",
                                "वडील"
                              )
                            : tr(
                                "OTHER (GUEST)",
                                "इतर (अतिथी)"
                              );

                        return (
                          <option
                            key={
                              relationship
                            }
                            value={
                              relationship
                            }
                          >
                            {
                              relationshipLabel
                            }
                          </option>
                        );
                      }
                    )}

                  </select>

                </div>


                {/* MOBILE */}

                <div className="form-field">

                  <label>
                    {tr(
                      "Mobile Number *",
                      "मोबाईल क्रमांक *"
                    )}
                  </label>

                  <input
                    inputMode="numeric"
                    maxLength={10}
                    value={
                      guest.mobile
                    }
                    onChange={(e) =>
                      updateGuest(
                        index,
                        "mobile",
                        e.target.value.replace(/\D/g, "")
                      )
                    }
                    placeholder={tr(
                      "Mobile number",
                      "मोबाईल क्रमांक"
                    )}
                  />

                </div>


                <div className="form-field">
                  <label>{tr("Aadhaar Number *", "आधार क्रमांक *")}</label>
                  <input
                    inputMode="numeric"
                    maxLength={12}
                    value={guest.aadhaar}
                    onChange={(e) =>
                      updateGuest(
                        index,
                        "aadhaar",
                        e.target.value.replace(/\D/g, "")
                      )
                    }
                    placeholder="12 digits"
                  />
                </div>
                <div className="form-field">
                  <label>{tr("Occupant ID document *", "अतिथीचे ओळखपत्र *")}</label>
                  <input
                    type="file"
                    required
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        showValidationMessage(tr("Each document must be 5 MB or smaller.", "प्रत्येक दस्तऐवज ५ MB किंवा त्यापेक्षा कमी असावा."));
                        event.target.value = "";
                        return;
                      }
                      setGuests((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, document: file }
                            : item
                        )
                      );
                    }}
                  />
                </div>


                {/* RELATIONSHIP PROOF */}

                {guest.relationship &&
                  guest.relationship !==
                    "SELF" && (

                    <>

                      <div className="form-field">

                        <label>
                          {tr(
                            "Relationship Proof Type *",
                            "नातेसंबंधाच्या पुराव्याचा प्रकार *"
                          )}
                        </label>

                        <select
                          value={
                            guest.relationshipProofType
                          }
                          onChange={(e) =>
                            updateRelationshipProofType(
                              index,
                              e.target.value
                            )
                          }
                        >

                          <option value="">
                            {tr(
                              "Select relationship proof",
                              "नातेसंबंधाचा पुरावा निवडा"
                            )}
                          </option>

                          {relationshipProofOptions.map(
                            (
                              proof
                            ) => (
                              <option
                                key={
                                  proof
                                }
                                value={
                                  proof
                                }
                              >
                                {proof}
                              </option>
                            )
                          )}

                        </select>

                      </div>


                      <div className="form-field">

                        <label>
                          {tr(
                            "Relationship Proof Number *",
                            "नातेसंबंधाचा पुरावा क्रमांक *"
                          )}
                        </label>

                        <input
                          value={
                            guest.relationshipProofNumber
                          }
                          onChange={(e) =>
                            updateRelationshipProofNumber(
                              index,
                              e.target.value
                            )
                          }
                          placeholder={tr(
                            "Relationship proof number",
                            "नातेसंबंधाचा पुरावा क्रमांक"
                          )}
                        />

                      </div>

                    </>

                  )}

              </div>

            </div>
          )
        )}

      </section>


      {/* =================================
          SECTION 3
      ================================== */}

      <section className="booking-card">

        <div className="booking-section-title">

          <span>
            03
          </span>

          <div>

            <h2>
              {tr(
                "Duration of Stay",
                "मुक्कामाचा कालावधी"
              )}
            </h2>

            <p>
              {tr(
                "Enter the complete stay duration.",
                "संपूर्ण मुक्कामाचा कालावधी प्रविष्ट करा."
              )}
            </p>

          </div>

        </div>


        <div
          style={{
            marginBottom:
              "18px",
            padding:
              "13px 16px",
            borderRadius:
              "9px",
            background:
              bookingType ===
              "CURRENT"
                ? "#f2f7f1"
                : "#f5f7f3",
            border:
              "1px solid #dfe6dc",
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "15px",
            flexWrap:
              "wrap",
          }}
        >

          <div>

            <div
              style={{
                fontSize:
                  "11px",
                fontWeight:
                  800,
                letterSpacing:
                  "1px",
                color:
                  "#53604f",
                textTransform:
                  "uppercase",
              }}
            >
              {bookingType ===
              "CURRENT"
                ? tr(
                    "CURRENT STAY",
                    "सध्याचा मुक्काम"
                  )
                : tr(
                    "ADVANCE RESERVATION",
                    "आगाऊ आरक्षण"
                  )}
            </div>

            <div
              style={{
                marginTop:
                  "4px",
                fontSize:
                  "13px",
                color:
                  "#6e776b",
              }}
            >
              {bookingType ===
              "CURRENT"
                ? tr(
                    `Check-in must be today (${today}).`,
                    `चेक-इन आजच्या तारखेला असणे आवश्यक आहे (${today}).`
                  )
                : tr(
                    `Check-in must be ${tomorrow} or later.`,
                    `चेक-इन ${tomorrow} किंवा त्यानंतर असणे आवश्यक आहे.`
                  )}
            </div>

          </div>

          <div
            style={{
              fontSize:
                "11px",
              fontWeight:
                800,
              letterSpacing:
                "0.7px",
              color:
                "#355d3b",
            }}
          >
            {bookingType ===
            "CURRENT"
              ? tr(
                  "CURRENT → OCCUPIED",
                  "सध्याचे → व्यापलेले"
                )
              : tr(
                  "ADVANCE → BOOKED",
                  "आगाऊ → आरक्षित"
                )}
          </div>

        </div>


        <div className="booking-grid">

          <div className="form-field">

            <label>
              {tr(
                "Check-In Date *",
                "चेक-इन तारीख *"
              )}
            </label>

            <input
              type="date"
              min={
                bookingType ===
                "CURRENT"
                  ? today
                  : tomorrow
              }
              max={
                bookingType ===
                "CURRENT"
                  ? today
                  : undefined
              }
              value={
                getDatePart(checkIn)
              }
              onChange={(e) =>
                handleCheckInChange(
                  e.target.value
                )
              }
              aria-invalid={Boolean(checkInError)}
              aria-describedby={checkInError ? "booking-check-in-error" : undefined}
            />
            {checkInError && (
              <small
                id="booking-check-in-error"
                className="booking-field-error"
                role="alert"
              >
                {checkInError}
              </small>
            )}

            <small
              style={{
                display:
                  "block",
                marginTop:
                  "7px",
                color:
                  "#7b8478",
                fontSize:
                  "11px",
              }}
            >
              {bookingType ===
              "CURRENT"
                ? tr(
                    `Today only: ${today}`,
                    `फक्त आज: ${today}`
                  )
                : tr(
                    `Tomorrow onward: ${tomorrow} or later`,
                    `उद्यापासून: ${tomorrow} किंवा त्यानंतर`
                  )}
            </small>

          </div>


          <div className="form-field">

            <label>
              {tr(
                "Check-Out Date *",
                "चेक-आउट तारीख *"
              )}
            </label>

            <input
              type="date"
              min={
                checkIn
                  ? getDatePart(checkIn)
                  : undefined
              }
              value={
                getDatePart(checkOut)
              }
              onChange={(e) =>
                handleCheckOutChange(
                  e.target.value
                )
              }
              aria-invalid={Boolean(checkOutError)}
              aria-describedby={checkOutError ? "booking-check-out-error" : undefined}
            />
            {checkOutError && (
              <small
                id="booking-check-out-error"
                className="booking-field-error"
                role="alert"
              >
                {checkOutError}
              </small>
            )}

            <small
              style={{
                display:
                  "block",
                marginTop:
                  "7px",
                color:
                  "#7b8478",
                fontSize:
                  "11px",
              }}
            >
              {tr(
                "Must be after the check-in date.",
                "चेक-इनच्या तारखेनंतरची तारीख असणे आवश्यक आहे."
              )}
            </small>

          </div>

        </div>

        <p
          style={{
            margin: "14px 0 0",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "#f2f7f0",
            color: "#355d3b",
            fontSize: "12px",
            lineHeight: 1.5,
          }}
          role="note"
        >
          {tr(
            `Standard check-in and check-out time is 1:00 PM on the selected dates. Same-day room reuse is allowed after the previous guest checks out and housekeeping clears the accommodation.`,
            `निवडलेल्या तारखांना नियमित चेक-इन आणि चेक-आउटची वेळ दुपारी १:०० आहे. मागील अतिथीने चेक-आउट केल्यानंतर आणि हाऊसकीपिंगने खोली स्वच्छ केल्यानंतर ती त्याच दिवशी पुन्हा देता येईल.`
          )}
        </p>

      </section>


      {/* =================================
          FOOTER ACTION
      ================================== */}

      <div className="booking-actions">

        <button
          type="button"
          className="secondary-action"
          onClick={onBack}
        >
          {tr(
            "CANCEL",
            "रद्द करा"
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
            "CONTINUE TO SEAT MATRIX →",
            "सीट मॅट्रिक्सकडे पुढे जा →"
          )}
        </button>

      </div>

    </main>
  );
}

export default Booking;