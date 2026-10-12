import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

export interface CheckoutFeedbackContext {
  booking_reference: string;
  check_in_date: string;
  expected_check_out_date: string;
  service_number?: string | null;
  service_rank?: string | null;
  service_name?: string | null;
  guests: Array<{
    name: string;
    relationship?: string | null;
    is_primary: boolean;
  }>;
  feedback?: {
    staff_rating: number | null;
    housekeeping_rating: number | null;
    facilities_rating: number | null;
    food_rating: number | null;
    overall_rating: number | null;
    comments: string | null;
    feedback_status: "SUBMITTED" | "SKIPPED";
  } | null;
}

export interface CheckoutFeedbackValues {
  staff_rating: number;
  housekeeping_rating: number;
  facilities_rating: number;
  food_rating: number;
  overall_rating: number;
  comments: string;
}

interface CheckoutFeedbackProps {
  context: CheckoutFeedbackContext;
  loading: boolean;
  draft?: CheckoutFeedbackValues | null;
  onDraftChange: (values: CheckoutFeedbackValues) => void;
  onBack?: () => void;
  onSubmit: (values: CheckoutFeedbackValues) => void;
  onSkip: () => void;
}

const getToday = (): string =>
  new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

function CheckoutFeedback({
  context,
  loading,
  draft,
  onDraftChange,
  onBack,
  onSubmit,
  onSkip,
}: CheckoutFeedbackProps) {
  const { language } = useLanguage();
  const isMarathi = language === "mr";
  const tr = (english: string, marathi: string) =>
    isMarathi ? marathi : english;

  const [ratings, setRatings] = useState<CheckoutFeedbackValues>({
    staff_rating: draft?.staff_rating ?? context.feedback?.staff_rating ?? 0,
    housekeeping_rating:
      draft?.housekeeping_rating ?? context.feedback?.housekeeping_rating ?? 0,
    facilities_rating:
      draft?.facilities_rating ?? context.feedback?.facilities_rating ?? 0,
    food_rating: draft?.food_rating ?? context.feedback?.food_rating ?? 0,
    overall_rating: draft?.overall_rating ?? context.feedback?.overall_rating ?? 0,
    comments: draft?.comments ?? context.feedback?.comments ?? "",
  });
  const [validationError, setValidationError] = useState("");

  const categories: Array<{
    key: keyof Omit<CheckoutFeedbackValues, "comments">;
    label: string;
    marathi: string;
  }> = [
    { key: "staff_rating", label: "Staff service", marathi: "कर्मचारी सेवा" },
    { key: "housekeeping_rating", label: "Housekeeping", marathi: "हाऊसकीपिंग" },
    { key: "facilities_rating", label: "Facilities", marathi: "सुविधा" },
    { key: "food_rating", label: "Food", marathi: "जेवण" },
    { key: "overall_rating", label: "Overall stay", marathi: "एकूण मुक्काम" },
  ];

  const updateRating = (
    key: keyof Omit<CheckoutFeedbackValues, "comments">,
    value: number
  ) => {
    const next = { ...ratings, [key]: value };
    setRatings(next);
    onDraftChange(next);
    setValidationError("");
  };

  const ratingsComplete = categories.every(
    ({ key }) => ratings[key] >= 1 && ratings[key] <= 5
  );

  const submit = () => {
    if (categories.some(({ key }) => ratings[key] < 1 || ratings[key] > 5)) {
      setValidationError(
        tr(
          "Please select a rating from 1 to 5 for every category.",
          "कृपया प्रत्येक विभागासाठी १ ते ५ मधील रेटिंग निवडा."
        )
      );
      return;
    }
    onSubmit(ratings);
  };

  const formatDate = (date: string) => {
    if (!date) return "-";
    const parsed = new Date(`${date.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime())
      ? date
      : parsed.toLocaleDateString(isMarathi ? "mr-IN" : "en-IN");
  };

  return (
    <section className="checkout-feedback-screen">
      <div className="checkout-feedback-toolbar">
        <div>
          <span className="section-label">
            {tr("FINAL CHECK-OUT STEP", "चेक-आउटचा अंतिम टप्पा")}
          </span>
          <h2>{tr("Guest Feedback", "अतिथी अभिप्राय")}</h2>
          <p>
            {tr(
              "We welcome your feedback. It is optional and helps us improve the Rest House.",
              "आपला अभिप्राय आम्हाला सेवा सुधारण्यास मदत करतो. अभिप्राय देणे ऐच्छिक आहे."
            )}
          </p>
        </div>
        <div className="checkout-feedback-rating-guide">
          {tr("1 = Poor", "१ = खराब")} <span>•</span> {tr("5 = Excellent", "५ = उत्कृष्ट")}
        </div>
      </div>

      <div className="checkout-feedback-rating-list">
        {categories.map(({ key, label, marathi }) => (
          <div className="checkout-feedback-rating-row" key={key}>
            <strong>{tr(label, marathi)}</strong>
            <div
              className="checkout-feedback-rating-options"
              role="radiogroup"
              aria-label={tr(label, marathi)}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={ratings[key] === value}
                  aria-label={`${value}${value === 1 ? ` - ${tr("Poor", "खराब")}` : value === 5 ? ` - ${tr("Excellent", "उत्कृष्ट")}` : ""}`}
                  className={ratings[key] === value ? "selected" : ""}
                  key={value}
                  onClick={() => updateRating(key, value)}
                  disabled={loading}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <label className="checkout-feedback-comment">
        <span>{tr("Comments (optional)", "अभिप्राय / सूचना (ऐच्छिक)")}</span>
        <textarea
          value={ratings.comments}
          maxLength={2000}
          rows={4}
          onChange={(event) => {
            const next = {
              ...ratings,
              comments: event.target.value,
            };
            setRatings(next);
            onDraftChange(next);
          }}
          placeholder={tr(
            "Share a comment or suggestion",
            "आपला अभिप्राय किंवा सूचना लिहा"
          )}
          disabled={loading}
        />
        <small>{ratings.comments.length}/2000</small>
      </label>

      {validationError && (
        <p className="checkout-feedback-error" role="alert">
          {validationError}
        </p>
      )}

      <div className="checkout-feedback-actions">
        {onBack && (
          <button
            type="button"
            className="secondary-action"
            onClick={onBack}
            disabled={loading}
          >
            {tr("BACK", "मागे")}
          </button>
        )}
        <button
          type="button"
          className="secondary-action checkout-feedback-print-button"
          onClick={() => window.print()}
          disabled={loading || !ratingsComplete}
        >
          {tr("PRINT FEEDBACK FORM", "अभिप्राय फॉर्म प्रिंट करा")}
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={onSkip}
          disabled={loading}
        >
          {tr("SKIP FEEDBACK", "अभिप्राय वगळा")}
        </button>
        <button
          type="button"
          className="continue-booking-button"
          onClick={submit}
          disabled={loading}
        >
          {loading
            ? tr("SAVING…", "जतन होत आहे…")
            : tr("SAVE & CONTINUE TO CHECK-OUT", "जतन करून चेक-आउटकडे जा")}
        </button>
      </div>

      <article className="checkout-feedback-printable">
        <header className="checkout-feedback-print-header">
          <strong>ESM REST HOUSE, PUNE</strong>
          <h1>{tr("GUEST FEEDBACK FORM", "अतिथी अभिप्राय फॉर्म")}</h1>
          <div className="checkout-feedback-print-date">
            {tr("Date", "दिनांक")}: {getToday()}
          </div>
        </header>

        <section className="checkout-feedback-print-booking">
          <div>
            <span>{tr("Booking reference", "बुकिंग संदर्भ")}</span>
            <strong>{context.booking_reference || "-"}</strong>
          </div>
          <div>
            <span>{tr("Check-in", "चेक-इन")}</span>
            <strong>{formatDate(context.check_in_date)}</strong>
          </div>
          <div>
            <span>{tr("Scheduled check-out", "नियोजित चेक-आउट")}</span>
            <strong>{formatDate(context.expected_check_out_date)}</strong>
          </div>
        </section>

        <section className="checkout-feedback-print-person">
          <h2>{tr("ESM / SERVICEMAN DETAILS", "माजी सैनिक / सेवारत सैनिक तपशील")}</h2>
          <div className="checkout-feedback-print-fields">
            <div><span>{tr("Name", "नाव")}</span><strong>{context.service_name || "-"}</strong></div>
            <div><span>{tr("Rank", "हुद्दा")}</span><strong>{context.service_rank || "-"}</strong></div>
            <div><span>{tr("Service / Registration No.", "सेवा / नोंदणी क्रमांक")}</span><strong>{context.service_number || "-"}</strong></div>
          </div>
        </section>

        <section className="checkout-feedback-print-person">
          <h2>{tr("GUEST / FAMILY MEMBERS", "अतिथी / कुटुंबीय")}</h2>
          <ol>
            {context.guests.map((guest, index) => (
              <li key={`${guest.name}-${index}`}>
                {guest.name || "-"}
                {guest.relationship
                  ? ` — ${tr(guest.relationship.replaceAll("_", " "), guest.relationship.replaceAll("_", " "))}`
                  : ""}
                {guest.is_primary ? ` (${tr("Primary guest", "मुख्य अतिथी")})` : ""}
              </li>
            ))}
          </ol>
        </section>

        <table className="checkout-feedback-print-ratings">
          <thead>
            <tr>
              <th>{tr("Service", "सेवा")}</th>
              {[1, 2, 3, 4, 5].map((value) => <th key={value}>{value}</th>)}
            </tr>
          </thead>
          <tbody>
            {categories.map(({ key, label, marathi }) => (
              <tr key={key}>
                <td>{tr(label, marathi)}</td>
                {[1, 2, 3, 4, 5].map((value) => (
                  <td key={value}>{ratings[key] === value ? "X" : ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="checkout-feedback-print-scale">
          {tr("1 = Poor", "१ = खराब")} &nbsp; | &nbsp; {tr("5 = Excellent", "५ = उत्कृष्ट")}
        </div>

        <section className="checkout-feedback-print-comments">
          <strong>{tr("Comments / Suggestions", "अभिप्राय / सूचना")}</strong>
          <p>{ratings.comments || ""}</p>
        </section>

        <footer className="checkout-feedback-print-signature">
          <span>{tr("Guest / Booking person's signature", "अतिथी / बुकिंग व्यक्तीची स्वाक्षरी")}</span>
          <span>{tr("For office use", "कार्यालयीन वापरासाठी")}</span>
        </footer>
      </article>
    </section>
  );
}

export default CheckoutFeedback;
