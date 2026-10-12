import "../App.css";
import { useLanguage } from "../i18n/LanguageContext";

export type GuestTypeValue =
  | "ESM"
  | "SERVING"
  | "CIVILIAN";

export type RateAccommodationCategory =
  | "AC"
  | "NON_AC"
  | "DORMITORY"
  | "HALL";

export interface RateSelection {
  guestType: GuestTypeValue;
  accommodationCategory: RateAccommodationCategory | "VIP";
  checkIn: string;
  checkOut: string;
  numberOfRooms: number;
  numberOfBeds: number;
  additionalRetiredMembers: number;
  additionalOtherRelations: number;
}

export interface BedRateDetail {
  roomName: string;
  bedNumber: number;
  guestName: string;
  relationship: string;
  guestType: GuestTypeValue;
  dailyRate: number;
  stayAmount: number;
}

export interface RateResult {
  accommodationRate: number;
  accommodationDays: number;
  accommodationAmount: number;
  additionalRetiredAmount: number;
  additionalOtherRelationAmount: number;
  additionalMemberAmount: number;
  totalAmount: number;
  bedRateDetails?: BedRateDetail[];
}

interface RateProps {
  officerName: string;
  guestType: GuestTypeValue;
  accommodationCategory: RateAccommodationCategory | "VIP";
  checkIn: string;
  checkOut: string;
  numberOfRooms: number;
  numberOfBeds: number;
  additionalRetiredMembers: number;
  additionalOtherRelations: number;
  onBack: () => void;
  onContinue: (selection: RateSelection) => void;
}

const calculateStayDays = (checkIn: string, checkOut: string): number => {
  if (!checkIn || !checkOut) return 0;
  const checkInDate = checkIn.slice(0, 10);
  const checkOutDate = checkOut.slice(0, 10);
  const difference =
    new Date(`${checkOutDate}T00:00:00`).getTime() -
    new Date(`${checkInDate}T00:00:00`).getTime();
  return difference >= 0
    ? Math.max(1, Math.ceil(difference / (1000 * 60 * 60 * 24)))
    : 0;
};

const formatScheduledDateTime = (
  value: string,
  hour: number,
  minute: number,
  locale: string
): string => {
  if (!value) return "—";

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day, hour, minute).toLocaleString(
    locale,
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

function Rate({
  officerName,
  guestType,
  accommodationCategory,
  checkIn,
  checkOut,
  numberOfRooms,
  numberOfBeds,
  additionalRetiredMembers,
  additionalOtherRelations,
  onBack,
  onContinue,
}: RateProps) {
  const { language, setLanguage } = useLanguage();
  const isMarathi = language === "mr";
  const tr = (english: string, marathi: string) =>
    isMarathi ? marathi : english;

  const stayDays = calculateStayDays(checkIn, checkOut);
  const datesAreValid = stayDays > 0;
  const guestTypeLabel =
    guestType === "ESM"
      ? tr("Ex-Serviceman", "माजी सैनिक")
      : guestType === "SERVING"
        ? tr("Serving", "सेवारत")
        : tr("Civilian", "नागरिक");
  const categoryLabel =
    accommodationCategory === "NON_AC"
      ? tr("Non-AC", "नॉन-एसी")
      : accommodationCategory === "DORMITORY"
        ? tr("Dormitory", "वसतिगृह")
        : accommodationCategory;

  const continueToBooking = () => {
    if (!datesAreValid) return;

    const selection: RateSelection = {
      guestType,
      accommodationCategory,
      checkIn,
      checkOut,
      numberOfRooms,
      numberOfBeds,
      additionalRetiredMembers,
      additionalOtherRelations,
    };

    onContinue(selection);
  };

  return (
    <main className="booking-screen rate-confirmation-screen">
      <header className="booking-header">
        <div>
          <span className="section-label">
            {tr("PRICING", "किंमत")}
          </span>
          <h1>{tr("Confirm Booking Details", "बुकिंग तपशील निश्चित करा")}</h1>
          <p>{tr("Officer", "अधिकारी")}: {officerName}</p>
        </div>

        <div className="rate-confirmation-header-actions">
          <div className="language-switcher" aria-label="Language selection">
            <button
              type="button"
              className={`language-button ${language === "en" ? "active" : ""}`}
              onClick={() => setLanguage("en")}
            >
              English
            </button>
            <span className="language-divider">|</span>
            <button
              type="button"
              className={`language-button ${language === "mr" ? "active" : ""}`}
              onClick={() => setLanguage("mr")}
            >
              मराठी
            </button>
          </div>
          <button
            type="button"
            className="availability-back-button"
            onClick={onBack}
          >
            ← {tr("Back", "मागे")}
          </button>
        </div>
      </header>

      <section className="booking-card rate-confirmation-progress">
        <ol>
          <li>{tr("Registration", "नोंदणी")}</li>
          <li>{tr("Availability", "उपलब्धता")}</li>
          <li>{tr("Acceptance", "स्वीकृती")}</li>
          <li>{tr("Guest type", "अतिथी प्रकार")}</li>
          <li aria-current="step">{tr("Confirmation", "पुष्टी")}</li>
        </ol>
      </section>

      <section className="booking-card rate-confirmation-summary">
        <div>
          <span>{tr("Guest Type", "अतिथी प्रकार")}</span>
          <strong>{guestTypeLabel}</strong>
        </div>
        <div>
          <span>{tr("Accommodation", "निवास")}</span>
          <strong>{categoryLabel}</strong>
        </div>
        <div>
          <span>{tr("Stay", "मुक्काम")}</span>
          <strong>{stayDays} {tr("day(s)", "दिवस")}</strong>
        </div>
        <div>
          <span>{tr("Check-in", "चेक-इन")}</span>
          <strong>
            {formatScheduledDateTime(
              checkIn,
              13,
              0,
              isMarathi ? "mr-IN" : "en-IN"
            )}
          </strong>
        </div>
        <div>
          <span>{tr("Check-out", "चेक-आउट")}</span>
          <strong>
            {formatScheduledDateTime(
              checkOut,
              13,
              0,
              isMarathi ? "mr-IN" : "en-IN"
            )}
          </strong>
        </div>
      </section>

      <section className="booking-card rate-organization-note">
        <strong>
          {tr(
            "Organization-approved settings will be applied automatically.",
            "संस्थेने मंजूर केलेली सेटिंग्ज आपोआप लागू केली जातील."
          )}
        </strong>
        <p>
          {tr(
            "Rates and room capacities are managed by Admin in Customize Room and Rates. The final payable amount is calculated from those settings.",
            "दर आणि खोलीची क्षमता Admin द्वारे Customize Room and Rates मध्ये व्यवस्थापित केली जाते. देय एकूण रक्कम त्या सेटिंग्जनुसार मोजली जाते."
          )}
        </p>
      </section>

      <div className="booking-actions">
        <button
          type="button"
          className="secondary-action"
          onClick={onBack}
        >
          {tr("BACK", "मागे")}
        </button>
        <button
          type="button"
          className="continue-booking-button"
          onClick={continueToBooking}
          disabled={!datesAreValid}
        >
          {tr("CONTINUE TO BOOKING →", "बुकिंगकडे पुढे जा →")}
        </button>
      </div>
      {!datesAreValid && (
        <p className="booking-field-error" role="alert">
          {tr(
            "Please verify the check-in and check-out dates.",
            "कृपया चेक-इन आणि चेक-आउटच्या तारखा तपासा."
          )}
        </p>
      )}
    </main>
  );
}

export default Rate;
