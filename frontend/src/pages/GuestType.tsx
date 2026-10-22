import { useState } from "react";

import "../App.css";

import { useLanguage } from "../i18n/LanguageContext";

/* =================================
   TYPES
================================== */

export type GuestTypeValue =
  | "ESM"
  | "SERVING"
  | "CIVILIAN";

export interface DormitoryGuestTypeSelection {
  guestId: string;
  guestName: string;
  guestType?: GuestTypeValue;
}

interface GuestTypeProps {
  officerName: string;
  dormitoryGuests?: DormitoryGuestTypeSelection[];

  onBack: () => void;

  onContinue: (
    guestType: GuestTypeValue,
    guestTypesByGuest?: Record<string, GuestTypeValue>
  ) => void;
}

/* =================================
   COMPONENT
================================== */

function GuestType({
  officerName,
  dormitoryGuests = [],
  onBack,
  onContinue,
}: GuestTypeProps) {

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
     STATE
  ================================== */

  const [
    selectedGuestType,
    setSelectedGuestType,
  ] = useState<GuestTypeValue | "">("");
  const [
    selectedGuestTypesByGuest,
    setSelectedGuestTypesByGuest,
  ] = useState<Record<string, GuestTypeValue>>(() =>
    Object.fromEntries(
      dormitoryGuests.flatMap((guest) =>
        guest.guestType
          ? [[guest.guestId, guest.guestType]]
          : []
      )
    )
  );
  const isPerGuestSelection = dormitoryGuests.length > 0;

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
     CONTINUE
  ================================== */

  const handleContinue = () => {
    if (isPerGuestSelection) {
      const missingGuest = dormitoryGuests.find(
        (guest) => !selectedGuestTypesByGuest[guest.guestId]
      );

      if (missingGuest) {
        window.alert(
          tr(
            `Please select a Guest Type for ${missingGuest.guestName}.`,
            `${missingGuest.guestName} यांच्यासाठी अतिथीचा प्रकार निवडा.`
          )
        );
        return;
      }

      onContinue(
        selectedGuestTypesByGuest[dormitoryGuests[0].guestId],
        selectedGuestTypesByGuest
      );
      return;
    }

    if (!selectedGuestType) {
      window.alert(
        tr(
          "Please select the Guest Type.",
          "कृपया अतिथीचा प्रकार निवडा."
        )
      );

      return;
    }

    onContinue(
      selectedGuestType
    );
  };

  /* =================================
     GUEST TYPE CARD
  ================================== */

  const renderGuestTypeCard = (
    type: GuestTypeValue,
    number: string,
    title: string,
    marathiTitle: string,
    description: string,
    marathiDescription: string,
    isSelected: boolean,
    onSelect: () => void
  ) => {
    return (
      <button
        type="button"
        onClick={onSelect}
        style={{
          width: "100%",
          textAlign: "left",
          border: isSelected
            ? "2px solid #355d3b"
            : "1px solid #dce3d8",
          background: isSelected
            ? "#f1f7ef"
            : "#ffffff",
          borderRadius: "14px",
          padding: "24px",
          cursor: "pointer",
          transition:
            "all 0.2s ease",
          boxShadow: isSelected
            ? "0 6px 18px rgba(53, 93, 59, 0.12)"
            : "0 2px 8px rgba(40, 55, 40, 0.04)",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "16px",
          }}
        >

          {/* NUMBER */}

          <div
            style={{
              width: "42px",
              height: "42px",
              minWidth: "42px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isSelected
                ? "#355d3b"
                : "#e9eee7",
              color: isSelected
                ? "#ffffff"
                : "#5d695b",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            {isSelected
              ? "✓"
              : number}
          </div>


          {/* CONTENT */}

          <div
            style={{
              flex: 1,
            }}
          >

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent:
                  "space-between",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >

              <h3
                style={{
                  margin: 0,
                  color: "#304633",
                  fontSize: "20px",
                  fontWeight: 800,
                }}
              >
                {tr(
                  title,
                  marathiTitle
                )}
              </h3>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding:
                    "5px 10px",
                  borderRadius: "20px",
                  background: isSelected
                    ? "#dcebd9"
                    : "#f0f3ee",
                  color: "#466249",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "1px",
                }}
              >
                {type}
              </span>

            </div>


            <p
              style={{
                margin:
                  "9px 0 0",
                color: "#6d766a",
                fontSize: "13px",
                lineHeight: 1.6,
              }}
            >
              {tr(
                description,
                marathiDescription
              )}
            </p>

          </div>

        </div>

      </button>
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
              "GUEST TYPE",
              "अतिथीचा प्रकार"
            )}
          </span>

          <h1>
            {tr(
              "Select Guest Type",
              "अतिथीचा प्रकार निवडा"
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
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
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

            <span
              style={{
                padding:
                  "7px 12px",
                borderRadius: "20px",
                background:
                  "#edf1eb",
                color:
                  "#647060",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              01 REGISTRATION
            </span>

            <span
              style={{
                color: "#a1aaa0",
              }}
            >
              →
            </span>

            <span
              style={{
                padding:
                  "7px 12px",
                borderRadius: "20px",
                background:
                  "#edf1eb",
                color:
                  "#647060",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              02 AVAILABILITY
            </span>

            <span
              style={{
                color: "#a1aaa0",
              }}
            >
              →
            </span>

            <span
              style={{
                padding:
                  "7px 12px",
                borderRadius: "20px",
                background:
                  "#edf1eb",
                color:
                  "#647060",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              03 ACCEPTANCE
            </span>

            <span
              style={{
                color: "#a1aaa0",
              }}
            >
              →
            </span>

            <span
              style={{
                padding:
                  "7px 12px",
                borderRadius: "20px",
                background:
                  "#355d3b",
                color:
                  "#ffffff",
                fontSize: "11px",
                fontWeight: 800,
              }}
            >
              04 GUEST TYPE
            </span>

          </div>

        </div>

      </section>


      {/* =================================
          INTRODUCTION
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding: "28px",
        }}
      >

        <div
          style={{
            maxWidth: "850px",
          }}
        >

          <div
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "1.8px",
              color: "#6f796c",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            {tr(
              "Accommodation Classification",
              "निवास वर्गीकरण"
            )}
          </div>

          <h2
            style={{
              margin:
                "0 0 10px",
              color:
                "#304633",
              fontSize:
                "24px",
            }}
          >
            {tr(
              "Who is staying at the Rest House?",
              "रेस्ट हाऊसमध्ये कोण मुक्काम करणार आहे?"
            )}
          </h2>

          <p
            style={{
              margin: 0,
              color:
                "#6c766b",
              fontSize:
                "14px",
              lineHeight:
                1.7,
            }}
          >
            {tr(
              isPerGuestSelection
                ? "Select a category for each guest assigned to a DM bed. The configured rate will be applied separately for each bed."
                : "Select the guest category. This selection will be used in the next stage to calculate the applicable accommodation rate.",
              isPerGuestSelection
                ? "DM बेडवर नियुक्त केलेल्या प्रत्येक अतिथीसाठी प्रकार निवडा. प्रत्येक बेडसाठी लागू दर स्वतंत्रपणे वापरला जाईल."
                : "अतिथीचा प्रकार निवडा. पुढील टप्प्यात लागू निवास दर निश्चित करण्यासाठी या निवडीचा वापर केला जाईल."
            )}
          </p>

        </div>

      </section>


      {/* =================================
          GUEST TYPE OPTIONS
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding: "28px",
        }}
      >

        <div className="booking-section-title">

          <span>
            04
          </span>

          <div>

            <h2>
              {tr(
                "Guest Type",
                "अतिथीचा प्रकार"
              )}
            </h2>

            <p>
              {tr(
                isPerGuestSelection
                  ? "Choose one category for every DM bed occupant."
                  : "Choose one category before proceeding to Rate.",
                isPerGuestSelection
                  ? "प्रत्येक DM बेडवरील अतिथीसाठी एक प्रकार निवडा."
                  : "दराच्या टप्प्यावर जाण्यापूर्वी एक प्रकार निवडा."
              )}
            </p>

          </div>

        </div>


        {isPerGuestSelection
          ? dormitoryGuests.map((guest) => (
              <div
                key={guest.guestId}
                style={{
                  padding: "20px",
                  marginTop: "18px",
                  border: "1px solid #dfe5dc",
                  borderRadius: "14px",
                  background: "#fafbf9",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px",
                    color: "#304633",
                    fontSize: "18px",
                  }}
                >
                  {guest.guestName}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(3, minmax(0, 1fr))",
                    gap: "16px",
                  }}
                >
                  {renderGuestTypeCard(
                    "ESM",
                    "1",
                    "ESM",
                    "माजी सैनिक",
                    "Ex-Serviceman / eligible ESM guest.",
                    "माजी सैनिक / पात्र ESM अतिथी.",
                    selectedGuestTypesByGuest[guest.guestId] === "ESM",
                    () =>
                      setSelectedGuestTypesByGuest((current) => ({
                        ...current,
                        [guest.guestId]: "ESM",
                      }))
                  )}
                  {renderGuestTypeCard(
                    "SERVING",
                    "2",
                    "Serving",
                    "सेवारत",
                    "Serving personnel guest.",
                    "सेवारत सैनिक / कर्मचारी अतिथी.",
                    selectedGuestTypesByGuest[guest.guestId] === "SERVING",
                    () =>
                      setSelectedGuestTypesByGuest((current) => ({
                        ...current,
                        [guest.guestId]: "SERVING",
                      }))
                  )}
                  {renderGuestTypeCard(
                    "CIVILIAN",
                    "3",
                    "Civilian",
                    "नागरिक",
                    "Civilian guest.",
                    "नागरिक अतिथी.",
                    selectedGuestTypesByGuest[guest.guestId] === "CIVILIAN",
                    () =>
                      setSelectedGuestTypesByGuest((current) => ({
                        ...current,
                        [guest.guestId]: "CIVILIAN",
                      }))
                  )}
                </div>
              </div>
            ))
          : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(3, minmax(0, 1fr))",
                gap: "16px",
              }}
            >
              {renderGuestTypeCard(
                "ESM",
                "1",
                "ESM",
                "माजी सैनिक",
                "Ex-Serviceman / eligible ESM guest.",
                "माजी सैनिक / पात्र ESM अतिथी.",
                selectedGuestType === "ESM",
                () => setSelectedGuestType("ESM")
              )}
              {renderGuestTypeCard(
                "SERVING",
                "2",
                "Serving",
                "सेवारत",
                "Serving personnel guest.",
                "सेवारत सैनिक / कर्मचारी अतिथी.",
                selectedGuestType === "SERVING",
                () => setSelectedGuestType("SERVING")
              )}
              {renderGuestTypeCard(
                "CIVILIAN",
                "3",
                "Civilian",
                "नागरिक",
                "Civilian guest.",
                "नागरिक अतिथी.",
                selectedGuestType === "CIVILIAN",
                () => setSelectedGuestType("CIVILIAN")
              )}
            </div>
          )}

      </section>


      {/* =================================
          SELECTED SUMMARY
      ================================== */}

      <section
        className="booking-card"
        style={{
          padding: "22px 28px",
          background:
            (isPerGuestSelection
              ? dormitoryGuests.every(
                  (guest) => selectedGuestTypesByGuest[guest.guestId]
                )
              : Boolean(selectedGuestType))
              ? "#f2f7f1"
              : "#fafbf9",
          border:
            (isPerGuestSelection
              ? dormitoryGuests.every(
                  (guest) => selectedGuestTypesByGuest[guest.guestId]
                )
              : Boolean(selectedGuestType))
              ? "1px solid #cdddc9"
              : "1px solid #e2e7df",
        }}
      >

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >

          <div>

            <div
              style={{
                fontSize: "11px",
                fontWeight: 800,
                letterSpacing: "1.2px",
                color: "#6f796c",
                textTransform: "uppercase",
                marginBottom: "5px",
              }}
            >
              {tr(
                isPerGuestSelection
                  ? "Selected Guest Types"
                  : "Selected Guest Type",
                isPerGuestSelection
                  ? "निवडलेले अतिथी प्रकार"
                  : "निवडलेला अतिथी प्रकार"
              )}
            </div>

            <div
              style={{
                fontSize: "17px",
                fontWeight: 800,
                color: "#304633",
              }}
            >
              {isPerGuestSelection
                ? dormitoryGuests.map((guest) => (
                    <div key={guest.guestId}>
                      {guest.guestName}:{" "}
                      {selectedGuestTypesByGuest[guest.guestId] ??
                        tr("Not selected", "निवडलेले नाही")}
                    </div>
                  ))
                : selectedGuestType || tr("Not selected", "निवडलेले नाही")}
            </div>

          </div>


          <div
            style={{
              fontSize: "12px",
              color: "#687367",
              lineHeight: 1.5,
              maxWidth: "450px",
            }}
          >
            {(isPerGuestSelection
              ? dormitoryGuests.every(
                  (guest) => selectedGuestTypesByGuest[guest.guestId]
                )
              : Boolean(selectedGuestType))
              ? tr(
                  isPerGuestSelection
                    ? "Guest type selected for every DM bed occupant. Continue to Rate."
                    : "Guest type selected. Continue to Rate.",
                  isPerGuestSelection
                    ? "प्रत्येक DM बेडवरील अतिथीसाठी प्रकार निवडला आहे. दराच्या टप्प्यावर पुढे जा."
                    : "अतिथीचा प्रकार निवडला आहे. दराच्या टप्प्यावर पुढे जा."
                )
              : tr(
                  isPerGuestSelection
                    ? "Select ESM, Serving or Civilian for every DM bed occupant."
                    : "Select ESM, Serving or Civilian to continue.",
                  isPerGuestSelection
                    ? "प्रत्येक DM बेडवरील अतिथीसाठी ESM, सेवारत किंवा नागरिक निवडा."
                    : "पुढे जाण्यासाठी ESM, सेवारत किंवा नागरिक निवडा."
                )}
          </div>

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
            "BACK",
            "मागे"
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
            "CONTINUE TO RATE →",
            "दराच्या टप्प्यावर पुढे जा →"
          )}
        </button>

      </div>

    </main>
  );
}

export default GuestType;