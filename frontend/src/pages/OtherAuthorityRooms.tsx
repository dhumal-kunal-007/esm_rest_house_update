import {
  useEffect,
  useState,
} from "react";

import "../App.css";
import BrandLogo from "../components/BrandLogo";
import { apiFetch } from "../api";

import type {
  UserRole,
} from "../App";

import { useLanguage } from "../i18n/LanguageContext";

/* =========================================
   ROOM
========================================= */

interface AuthorityRoom {
  id: string;
  room_number: string;
  total_beds: number;
  room_status: string;
  is_active: boolean;
  category_name: string;

  receptionist_can_book: boolean;
  receptionist_can_allot: boolean;
  receptionist_emergency_allot: boolean;

  authority_role: string;
  authority_can_book: boolean;
  authority_can_allot: boolean;
  authority_can_approve: boolean;
}

/* =========================================
   BED
========================================= */

interface RoomBed {
  id: string;
  room_id: string;
  bed_number: number;
  bed_status: string;
  is_active: boolean;
}

/* =========================================
   EXPLICIT AUTHORITY SELECTION
========================================= */

export interface ExplicitAuthoritySelection {
  roomId: string;
  roomNumber: string;
  categoryName: string;
  authorityRole: string;
  bedId?: string;
  bedNumber?: number;
  isMatrixRoom: boolean;
}

/* =========================================
   PROPS
========================================= */

interface OtherAuthorityRoomsProps {
  role: UserRole;
  onBack: () => void;
  onContinue: (
    selection: ExplicitAuthoritySelection
  ) => void;
}

/* =========================================
   AUTHORITY DISPLAY NAME
========================================= */

const getAuthorityDisplayName = (
  role: string
) => {
  switch (role) {
    case "DY_DIRECTOR":
      return "Deputy Director";

    case "SUPERINTENDENT":
      return "Superintendent";

    case "WELFARE_ORGANISER":
      return "Welfare Organizer";

    case "OLC_REST_HOUSE_MANAGER":
      return "OLC Rest House Manager";

    case "RECEPTIONIST":
      return "Receptionist";

    case "ADMIN":
      return "Administrator";

    default:
      return role;
  }
};

/* =========================================
   MATRIX ROOM CHECK

   IMPORTANT:
   Only DM / HALL are matrix rooms.

   AC / VIP / NAC remain room-selection
   rooms.
========================================= */

const isMatrixRoom = (
  room: AuthorityRoom
) => {
  const category = String(room.category_name || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const roomName = String(
    room.room_number || ""
  ).toUpperCase();

  if (["AC", "NON_AC", "NAC", "VIP", "AC_VIP"].includes(category)) {
    return false;
  }
  if (["DORMITORY", "DM", "HALL"].includes(category)) {
    return true;
  }

  return (
    roomName.startsWith("DM") ||
    roomName === "HALL"
  );
};

/* =========================================
   ROOM TYPE
========================================= */

const getRoomType = (
  room: AuthorityRoom
) => {
  const category = String(room.category_name || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  const roomName = String(
    room.room_number || ""
  ).toUpperCase();

  if (["VIP", "AC_VIP"].includes(category)) {
    return "VIP";
  }
  if (category === "AC") {
    return "AC";
  }
  if (["NAC", "NON_AC"].includes(category)) {
    return "NAC";
  }
  if (["DM", "DORMITORY"].includes(category)) {
    return "DM";
  }
  if (category === "HALL") {
    return "HALL";
  }
  if (roomName.includes("VIP")) return "VIP";
  if (roomName.startsWith("AC")) return "AC";
  if (roomName.startsWith("NAC")) return "NAC";
  if (roomName.startsWith("DM")) return "DM";
  if (roomName === "HALL") return "HALL";

  return "OTHER";
};

/* =========================================
   CHRONOLOGICAL ROOM SORT
========================================= */

const getRoomNumberValue = (
  roomNumber: string
) => {
  const match = String(
    roomNumber || ""
  ).match(/\d+/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[0]);
};

const sortRoomsChronologically = (
  roomList: AuthorityRoom[]
) => {
  return [...roomList].sort(
    (first, second) => {
      const firstNumber =
        getRoomNumberValue(
          first.room_number
        );

      const secondNumber =
        getRoomNumberValue(
          second.room_number
        );

      if (
        firstNumber !==
        secondNumber
      ) {
        return (
          firstNumber -
          secondNumber
        );
      }

      return String(
        first.room_number
      ).localeCompare(
        String(
          second.room_number
        ),
        "en",
        {
          numeric: true,
          sensitivity: "base",
        }
      );
    }
  );
};

/* =========================================
   COMPONENT
========================================= */

function OtherAuthorityRooms({
  role,
  onBack,
  onContinue,
}: OtherAuthorityRoomsProps) {
  const {
    language,
    setLanguage,
  } = useLanguage();

  const isMarathi =
    language === "mr";

  const tr = (
    english: string,
    marathi: string
  ) =>
    isMarathi
      ? marathi
      : english;

  /* =========================================
     ROOMS
  ========================================== */

  const [
    rooms,
    setRooms,
  ] = useState<AuthorityRoom[]>([]);

  /* =========================================
     SELECTED ROOM
  ========================================== */

  const [
    selectedRoom,
    setSelectedRoom,
  ] = useState<AuthorityRoom | null>(
    null
  );

  /* =========================================
     BEDS
  ========================================== */

  const [
    beds,
    setBeds,
  ] = useState<RoomBed[]>([]);

  /* =========================================
     SELECTED BED
  ========================================== */

  const [
    selectedBed,
    setSelectedBed,
  ] = useState<RoomBed | null>(
    null
  );

  /* =========================================
     LOADING
  ========================================== */

  const [
    loadingRooms,
    setLoadingRooms,
  ] = useState(true);

  const [
    loadingBeds,
    setLoadingBeds,
  ] = useState(false);

  /* =========================================
     ERROR
  ========================================== */

  const [
    error,
    setError,
  ] = useState("");

  /* =========================================
     LANGUAGE SWITCHER
  ========================================== */

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
     ROOM STATUS LABEL
  ========================================== */

  const getRoomStatusLabel = (
    status: string
  ) => {
    switch (
      String(status || "").toUpperCase()
    ) {
      case "AVAILABLE":
        return tr(
          "Available",
          "उपलब्ध"
        );

      case "OCCUPIED":
        return tr(
          "Occupied",
          "व्यापलेले"
        );

      case "BOOKED":
        return tr(
          "Booked",
          "बुक केलेले"
        );

      case "RESERVED":
        return tr(
          "Reserved",
          "आरक्षित"
        );

      case "NEEDS_CLEANING":
        return tr(
          "Needs Cleaning",
          "साफसफाई आवश्यक"
        );

      case "CLEANING":
      case "HOUSEKEEPING_CLEANING":
        return tr(
          "Cleaning",
          "साफसफाई सुरू आहे"
        );

      case "OUT":
      case "OUT_OF_SERVICE":
        return tr(
          "Out of Service",
          "सेवेबाहेर"
        );

      default:
        return status || tr(
          "Not Available",
          "उपलब्ध नाही"
        );
    }
  };

  /* =========================================
     BED STATUS LABEL
  ========================================== */

  const getBedStatusLabel = (
    status: string
  ) => {
    switch (
      String(status || "").toUpperCase()
    ) {
      case "AVAILABLE":
        return tr(
          "Available",
          "उपलब्ध"
        );

      case "OCCUPIED":
        return tr(
          "Occupied",
          "व्यापलेले"
        );

      case "BOOKED":
        return tr(
          "Booked",
          "बुक केलेले"
        );

      case "RESERVED":
        return tr(
          "Reserved",
          "आरक्षित"
        );

      case "NEEDS_CLEANING":
        return tr(
          "Needs Cleaning",
          "साफसफाई आवश्यक"
        );

      case "CLEANING":
        return tr(
          "Cleaning",
          "साफसफाई सुरू आहे"
        );

      default:
        return status;
    }
  };

  /* =========================================
     LOAD AUTHORITY ROOMS
  ========================================== */

  useEffect(() => {
    let cancelled = false;

    const loadRooms = async () => {
      try {
        setLoadingRooms(true);
        setError("");

        const response =
          await apiFetch(
            `http://localhost:5000/api/rooms/authority-rooms?role=${encodeURIComponent(
              role
            )}`
          );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.success
        ) {
          throw new Error(
            data.message ||
              tr(
                "Unable to load authority rooms.",
                "अधिकृत खोल्या लोड करता आल्या नाहीत."
              )
          );
        }

        const loadedRooms =
          Array.isArray(data.rooms)
            ? data.rooms
            : [];

        const sortedRooms =
          sortRoomsChronologically(
            loadedRooms
          );

        if (!cancelled) {
          setRooms(sortedRooms);
        }
      } catch (err) {
        console.error(
          "Authority rooms error:",
          err
        );

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : tr(
                  "Unable to load authority rooms.",
                  "अधिकृत खोल्या लोड करता आल्या नाहीत."
                )
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingRooms(false);
        }
      }
    };

    loadRooms();

    return () => {
      cancelled = true;
    };
  }, [role]);

  /* =========================================
     LOAD BEDS
  ========================================== */

  const loadBeds = async (
    room: AuthorityRoom
  ) => {
    try {
      setLoadingBeds(true);
      setError("");

      const response =
        await apiFetch(
          `http://localhost:5000/api/rooms/${room.id}/beds`
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.message ||
            tr(
              "Unable to load room beds.",
              "खोलीचे बेड लोड करता आले नाहीत."
            )
        );
      }

      const loadedBeds =
        Array.isArray(data.beds)
          ? data.beds
          : [];

      const sortedBeds = [
        ...loadedBeds,
      ].sort(
        (
          first: RoomBed,
          second: RoomBed
        ) =>
          first.bed_number -
          second.bed_number
      );

      setBeds(sortedBeds);
    } catch (err) {
      console.error(
        "Room beds error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : tr(
              "Unable to load room beds.",
              "खोलीचे बेड लोड करता आले नाहीत."
            )
      );
    } finally {
      setLoadingBeds(false);
    }
  };

  /* =========================================
     ROOM SELECTION
  ========================================== */

  const handleRoomSelect = async (
    room: AuthorityRoom
  ) => {
    setSelectedRoom(room);
    setSelectedBed(null);
    setBeds([]);
    setError("");

    /*
     * Load beds for information and
     * availability validation.
     *
     * IMPORTANT:
     *
     * AC / VIP / NAC:
     * complete room selection.
     *
     * DM / HALL:
     * exact bed selection.
     */
    await loadBeds(room);
  };

  /* =========================================
     SELECT BED
  ========================================== */

  const handleBedSelect = (
    bed: RoomBed
  ) => {
    if (
      String(
        bed.bed_status
      ).toUpperCase() !==
      "AVAILABLE"
    ) {
      return;
    }

    setSelectedBed(bed);
    setError("");
  };

  /* =========================================
     AVAILABLE BED COUNT
  ========================================== */

  const getAvailableBedCount = () => {
    return beds.filter(
      (bed) =>
        String(
          bed.bed_status
        ).toUpperCase() ===
        "AVAILABLE"
    ).length;
  };

  /* =========================================
     CHANGE ROOM
  ========================================== */

  const handleChangeRoom = () => {
    setSelectedRoom(null);
    setSelectedBed(null);
    setBeds([]);
    setError("");
  };

  /* =========================================
     CONTINUE NORMAL ROOM

     AC / VIP / NAC
     = ROOM ONLY
  ========================================== */

  const handleNormalRoomContinue = () => {
    if (!selectedRoom) {
      setError(
        tr(
          "Please select a room.",
          "कृपया खोली निवडा."
        )
      );

      return;
    }

    const availableBeds =
      beds.filter(
        (bed) =>
          String(
            bed.bed_status
          ).toUpperCase() ===
          "AVAILABLE"
      );

    if (
      availableBeds.length ===
      0
    ) {
      setError(
        tr(
          `${selectedRoom.room_number} has no available beds and cannot be allotted.`,
          `${selectedRoom.room_number} मध्ये कोणतेही उपलब्ध बेड नाहीत आणि खोली देता येणार नाही.`
        )
      );

      return;
    }

    onContinue({
      roomId:
        selectedRoom.id,

      roomNumber:
        selectedRoom.room_number,

      categoryName:
        selectedRoom.category_name,

      authorityRole:
        selectedRoom.authority_role,

      isMatrixRoom:
        false,
    });
  };

  /* =========================================
     CONTINUE MATRIX ROOM

     DM / HALL
     = EXACT BED
  ========================================== */

  const handleMatrixRoomContinue = () => {
    if (!selectedRoom) {
      setError(
        tr(
          "Please select a room.",
          "कृपया खोली निवडा."
        )
      );

      return;
    }

    if (!selectedBed) {
      setError(
        tr(
          "Please select an available bed.",
          "कृपया उपलब्ध बेड निवडा."
        )
      );

      return;
    }

    onContinue({
      roomId:
        selectedRoom.id,

      roomNumber:
        selectedRoom.room_number,

      categoryName:
        selectedRoom.category_name,

      authorityRole:
        selectedRoom.authority_role,

      bedId:
        selectedBed.id,

      bedNumber:
        selectedBed.bed_number,

      isMatrixRoom:
        true,
    });
  };

  /* =========================================
     LOADING
  ========================================== */

  if (loadingRooms) {
    return (
      <main className="dashboard-screen">
        <header className="dashboard-header">
          <div className="dashboard-brand">
            <BrandLogo className="dashboard-logo" />

            <div>
              <h1>
                ESM REST HOUSE
              </h1>

              <p>
                {tr(
                  "Booking & Management System",
                  "बुकिंग आणि व्यवस्थापन प्रणाली"
                )}
              </p>
            </div>
          </div>

          {languageSwitcher}
        </header>

        <section className="dashboard-content">
          <div className="dashboard-panel">
            <h2>
              {tr(
                "Other Authority Rooms",
                "इतर अधिकृत खोल्या"
              )}
            </h2>

            <p>
              {tr(
                "Loading authority rooms...",
                "अधिकृत खोल्या लोड होत आहेत..."
              )}
            </p>
          </div>
        </section>
      </main>
    );
  }

  /* =========================================
     PAGE
  ========================================== */

  return (
    <main className="dashboard-screen">
      {/* =====================================
          HEADER
      ====================================== */}

      <header className="dashboard-header">
        <div className="dashboard-brand">
          <BrandLogo className="dashboard-logo" />

          <div>
            <h1>
              ESM REST HOUSE
            </h1>

            <p>
              {tr(
                "Booking & Management System",
                "बुकिंग आणि व्यवस्थापन प्रणाली"
              )}
            </p>
          </div>
        </div>

        <div className="dashboard-user">
          {languageSwitcher}

          <div className="user-info">
            <strong>
              {tr(
                "Receptionist",
                "रिसेप्शनिस्ट"
              )}
            </strong>

            <span>
              {tr(
                "OTHER AUTHORITY ROOMS",
                "इतर अधिकृत खोल्या"
              )}
            </span>
          </div>

          <button
            type="button"
            className="logout-button"
            onClick={onBack}
          >
            {tr(
              "BACK",
              "मागे"
            )}
          </button>
        </div>
      </header>

      {/* =====================================
          CONTENT
      ====================================== */}

      <section className="dashboard-content">
        {/* ===================================
            PAGE TITLE
        ==================================== */}

        <div className="dashboard-title">
          <div>
            <h2>
              {tr(
                "Other Authority Rooms",
                "इतर अधिकृत खोल्या"
              )}
            </h2>

            <p>
              {tr(
                "Explicit Booking / Allotment",
                "विशेष बुकिंग / वाटप"
              )}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
            }}
          >
            <span className="dashboard-date">
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
            </span>
          </div>
        </div>

        {/* ===================================
            INFORMATION
        ==================================== */}

        <div className="dashboard-panel">
          <h3>
            {tr(
              "Authority Room Allotment",
              "अधिकृत खोली वाटप"
            )}
          </h3>

          <p>
            {tr(
              "These rooms are controlled by other authorities. The Receptionist may explicitly allot available accommodation, but approval remains with the responsible authority.",
              "या खोल्या इतर अधिकाऱ्यांच्या नियंत्रणाखाली आहेत. रिसेप्शनिस्ट उपलब्ध निवासाचे विशेष वाटप करू शकतो, परंतु मंजुरी संबंधित जबाबदार अधिकाऱ्याकडेच राहते."
            )}
          </p>
        </div>

        {/* ===================================
            ERROR
        ==================================== */}

        {error && (
          <div className="dashboard-panel">
            <p className="restricted-message">
              {error}
            </p>
          </div>
        )}

        {/* ===================================
            ROOM LIST
        ==================================== */}

        {!selectedRoom && (
          <div className="dashboard-panel">
            <h3>
              {tr(
                "Select Authority Room",
                "अधिकृत खोली निवडा"
              )}
            </h3>

            {rooms.length === 0 ? (
              <p className="restricted-message">
                {tr(
                  "No other authority rooms are currently available for explicit allotment.",
                  "सध्या विशेष वाटपासाठी इतर कोणत्याही अधिकृत खोल्या उपलब्ध नाहीत."
                )}
              </p>
            ) : (
              <div className="dashboard-cards">
                {rooms.map((room) => {
                  const matrixRoom =
                    isMatrixRoom(room);

                  const roomType =
                    getRoomType(room);

                  return (
                    <button
                      key={room.id}
                      type="button"
                      className="stat-card"
                      onClick={() =>
                        handleRoomSelect(
                          room
                        )
                      }
                      style={{
                        cursor:
                          "pointer",
                        textAlign:
                          "left",
                      }}
                    >
                      <span>
                        {roomType}
                      </span>

                      <strong>
                        {room.room_number}
                      </strong>

                      <span>
                        {room.total_beds}{" "}
                        {tr(
                          "beds",
                          "बेड"
                        )}
                      </span>

                      <span>
                        {tr(
                          "Authority:",
                          "अधिकारी:"
                        )}{" "}
                        {getAuthorityDisplayName(
                          room.authority_role
                        )}
                      </span>

                      <span>
                        {getRoomStatusLabel(
                          room.room_status
                        )}
                      </span>

                      <span>
                        {matrixRoom
                          ? tr(
                              "Exact bed selection",
                              "अचूक बेड निवड"
                            )
                          : tr(
                              "Complete room selection",
                              "संपूर्ण खोली निवड"
                            )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ===================================
            SELECTED NORMAL ROOM

            AC / VIP / NAC
        ==================================== */}

        {selectedRoom &&
          !isMatrixRoom(
            selectedRoom
          ) && (
            <div className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    {
                      selectedRoom.room_number
                    }
                  </h3>

                  <p>
                    {
                      selectedRoom.category_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleChangeRoom
                  }
                >
                  {tr(
                    "Change Room",
                    "खोली बदला"
                  )}
                </button>
              </div>

              <div className="dashboard-cards">
                <div className="stat-card">
                  <span>
                    {tr(
                      "Room",
                      "खोली"
                    )}
                  </span>

                  <strong>
                    {
                      selectedRoom.room_number
                    }
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    {tr(
                      "Total Beds",
                      "एकूण बेड"
                    )}
                  </span>

                  <strong>
                    {
                      selectedRoom.total_beds
                    }
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    {tr(
                      "Available Beds",
                      "उपलब्ध बेड"
                    )}
                  </span>

                  <strong>
                    {
                      getAvailableBedCount()
                    }
                  </strong>
                </div>

                <div className="stat-card">
                  <span>
                    {tr(
                      "Authority",
                      "अधिकारी"
                    )}
                  </span>

                  <strong>
                    {getAuthorityDisplayName(
                      selectedRoom.authority_role
                    )}
                  </strong>
                </div>
              </div>

              {/* APPROVAL */}

              <div className="dashboard-panel">
                <h3>
                  {tr(
                    "Approval Authority",
                    "मंजुरी अधिकारी"
                  )}
                </h3>

                <p>
                  {tr(
                    "This booking requires approval from:",
                    "या बुकिंगसाठी मंजुरी आवश्यक आहे:"
                  )}

                  <strong>
                    {" "}
                    {getAuthorityDisplayName(
                      selectedRoom.authority_role
                    )}
                  </strong>
                </p>

                <p>
                  {tr(
                    "The Receptionist can allot the room, but approval does not transfer to the Receptionist.",
                    "रिसेप्शनिस्ट खोलीचे वाटप करू शकतो, परंतु मंजुरीचा अधिकार रिसेप्शनिस्टकडे हस्तांतरित होत नाही."
                  )}
                </p>
              </div>

              {/* ROOM SELECTION */}

              <div className="dashboard-panel">
                <h3>
                  {tr(
                    "Room Selected",
                    "खोली निवडली"
                  )}
                </h3>

                <p>
                  <strong>
                    {
                      selectedRoom.room_number
                    }
                  </strong>{" "}
                  {tr(
                    "has been selected.",
                    "निवडली आहे."
                  )}
                </p>

                <p>
                  {tr(
                    "Individual bed selection is not required for AC / VIP / NAC rooms. The system will handle the required available bed allocation internally.",
                    "AC / VIP / NAC खोल्यांसाठी स्वतंत्र बेड निवड आवश्यक नाही. आवश्यक उपलब्ध बेडचे वाटप प्रणाली अंतर्गत करेल."
                  )}
                </p>

                <button
                  type="button"
                  onClick={
                    handleNormalRoomContinue
                  }
                  style={{
                    marginTop:
                      "20px",
                    minHeight:
                      "48px",
                    padding:
                      "0 24px",
                    fontWeight:
                      700,
                  }}
                >
                  {tr(
                    "CONTINUE TO EXPLICIT BOOKING →",
                    "विशेष बुकिंगकडे पुढे जा →"
                  )}
                </button>
              </div>
            </div>
          )}

        {/* ===================================
            SELECTED DM / HALL
        ==================================== */}

        {selectedRoom &&
          isMatrixRoom(
            selectedRoom
          ) && (
            <div className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h3>
                    {
                      selectedRoom.room_number
                    }
                  </h3>

                  <p>
                    {
                      selectedRoom.category_name
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    handleChangeRoom
                  }
                >
                  {tr(
                    "Change Room",
                    "खोली बदला"
                  )}
                </button>
              </div>

              {/* APPROVAL */}

              <div className="dashboard-panel">
                <h3>
                  {tr(
                    "Approval Authority",
                    "मंजुरी अधिकारी"
                  )}
                </h3>

                <p>
                  {tr(
                    "This booking requires approval from:",
                    "या बुकिंगसाठी मंजुरी आवश्यक आहे:"
                  )}

                  <strong>
                    {" "}
                    {getAuthorityDisplayName(
                      selectedRoom.authority_role
                    )}
                  </strong>
                </p>

                <p>
                  {tr(
                    "The Receptionist can allot the selected bed, but approval remains with the responsible authority.",
                    "रिसेप्शनिस्ट निवडलेल्या बेडचे वाटप करू शकतो, परंतु मंजुरी संबंधित जबाबदार अधिकाऱ्याकडेच राहते."
                  )}
                </p>
              </div>

              {loadingBeds ? (
                <div className="dashboard-panel">
                  <p>
                    {tr(
                      "Loading beds...",
                      "बेड लोड होत आहेत..."
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <div className="dashboard-cards">
                    <div className="stat-card">
                      <span>
                        {tr(
                          "Total Beds",
                          "एकूण बेड"
                        )}
                      </span>

                      <strong>
                        {beds.length}
                      </strong>
                    </div>

                    <div className="stat-card">
                      <span>
                        {tr(
                          "Available Beds",
                          "उपलब्ध बेड"
                        )}
                      </span>

                      <strong>
                        {
                          getAvailableBedCount()
                        }
                      </strong>
                    </div>

                    <div className="stat-card">
                      <span>
                        {tr(
                          "Selected Bed",
                          "निवडलेला बेड"
                        )}
                      </span>

                      <strong>
                        {selectedBed
                          ? `${tr(
                              "BED",
                              "बेड"
                            )} ${
                              selectedBed.bed_number
                            }`
                          : tr(
                              "NONE",
                              "नाही"
                            )}
                      </strong>
                    </div>
                  </div>

                  {/* BED MATRIX */}

                  <div className="dashboard-panel">
                    <h3>
                      {tr(
                        "Select Exact Bed",
                        "अचूक बेड निवडा"
                      )}
                    </h3>

                    <p>
                      {tr(
                        "Select the exact available bed number.",
                        "उपलब्ध असलेला अचूक बेड क्रमांक निवडा."
                      )}
                    </p>

                    <div
                      className="bed-grid"
                      style={{
                        marginTop:
                          "20px",
                      }}
                    >
                      {beds.map(
                        (bed) => {
                          const available =
                            String(
                              bed.bed_status
                            ).toUpperCase() ===
                            "AVAILABLE";

                          const selected =
                            selectedBed?.id ===
                            bed.id;

                          return (
                            <button
                              key={
                                bed.id
                              }
                              type="button"
                              disabled={
                                !available
                              }
                              onClick={() =>
                                handleBedSelect(
                                  bed
                                )
                              }
                              className={`bed-card ${
                                available
                                  ? "available"
                                  : "occupied"
                              } ${
                                selected
                                  ? "selected"
                                  : ""
                              }`}
                            >
                              <span className="bed-number">
                                {tr(
                                  "BED",
                                  "बेड"
                                )}{" "}
                                {
                                  bed.bed_number
                                }
                              </span>

                              <span className="bed-status">
                                {selected
                                  ? tr(
                                      "SELECTED",
                                      "निवडलेले"
                                    )
                                  : getBedStatusLabel(
                                      bed.bed_status
                                    )}
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {/* SELECTION SUMMARY */}

                  {selectedBed && (
                    <div className="dashboard-panel">
                      <h3>
                        {tr(
                          "Selection Summary",
                          "निवड सारांश"
                        )}
                      </h3>

                      <p>
                        <strong>
                          {tr(
                            "Room:",
                            "खोली:"
                          )}
                        </strong>{" "}
                        {
                          selectedRoom.room_number
                        }
                      </p>

                      <p>
                        <strong>
                          {tr(
                            "Bed:",
                            "बेड:"
                          )}
                        </strong>{" "}
                        {
                          selectedBed.bed_number
                        }
                      </p>

                      <p>
                        <strong>
                          {tr(
                            "Approval Authority:",
                            "मंजुरी अधिकारी:"
                          )}
                        </strong>{" "}
                        {getAuthorityDisplayName(
                          selectedRoom.authority_role
                        )}
                      </p>

                      <button
                        type="button"
                        onClick={
                          handleMatrixRoomContinue
                        }
                        style={{
                          marginTop:
                            "20px",
                          minHeight:
                            "48px",
                          padding:
                            "0 24px",
                          fontWeight:
                            700,
                        }}
                      >
                        {tr(
                          "CONTINUE TO EXPLICIT BOOKING →",
                          "विशेष बुकिंगकडे पुढे जा →"
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
      </section>
    </main>
  );
}

export default OtherAuthorityRooms;