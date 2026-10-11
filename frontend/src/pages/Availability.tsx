import { useEffect, useMemo, useState } from "react";
import "../App.css";
import { apiFetch } from "../api";

import type { AccommodationCategory, UserRole } from "../App";
import type { BookingDraft } from "./Booking";
import type { ExplicitAuthoritySelection } from "../AuthoritySelection";

import { useLanguage } from "../i18n/LanguageContext";

export type BedStatus =
  | "available"
  | "reserved"
  | "occupied"
  | "needs_cleaning"
  | "cleaning"
  | "out"
  | "unavailable"
  | "booked";

export interface Bed {
  id: string;
  number: number;
  status: BedStatus;
  occupant?: string;
}

export interface Room {
  id: string;
  name: string;
  category?: string;
  genderRestriction?: string;
  roomNote?: string | null;
  approvalAuthorityRole?: string | null;
  isOtherAuthorityRoom?: boolean;
  currentStatus?: string;
  isUnderMaintenance?: boolean;
  totalBeds?: number;
  allowedGender?: string | null;
  usage?: string;
  assignments?: RoomAssignment[];
  beds: Bed[];
}

interface RoomCapacity {
  room_id: string;
  room_capacity: number | string | null;
  bed_capacity: number | string | null;
  esm_room_rate: number | string | null;
  serving_room_rate: number | string | null;
  civilian_room_rate: number | string | null;
}

interface BookingDocument {
  id: string;
  person_type: "BOOKING_PERSON" | "OCCUPANT";
  person_name: string;
  content_type: string;
}

interface RoomAssignment {
  allotment_id: string;
  allotment_status: string;
  booking_reference: string;
  guest_id: string | null;
  guest_name: string | null;
  mobile_number: string | null;
  check_in_date: string;
  expected_check_out_date: string;
  check_in_time: string | null;
  check_in_status: string;
}

export interface BedSelection {
  roomId: string;
  roomName: string;
  bedId: string;
  bedNumber: number;
  occupantName: string;
  guestId: string;
}

interface AvailabilityProps {
  category: AccommodationCategory;
  role: UserRole;
  booking?: BookingDraft | null;
  authoritySelection?: ExplicitAuthoritySelection | null;
  initialSelections?: BedSelection[];
  onBack: () => void;
  onConfirmBooking: (selection: BedSelection[]) => void;
  onSelectionsChange?: (selection: BedSelection[]) => void;
}

const normalize = (value: unknown): string =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const toLocalDateInputValue = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const addOneDay = (dateValue: string): string => {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return toLocalDateInputValue(date);
};

const formatAvailabilityDate = (
  dateValue: string,
  language: string
): string =>
  new Date(`${dateValue}T12:00:00`).toLocaleDateString(
    language === "mr" ? "mr-IN" : "en-IN",
    { day: "numeric", month: "long", year: "numeric" }
  );

const getDateKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;

const getCalendarDays = (month: Date): Date[] => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const startDay = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    1 - firstDay.getDay()
  );
  return Array.from({ length: 42 }, (_, index) =>
    new Date(
      startDay.getFullYear(),
      startDay.getMonth(),
      startDay.getDate() + index
    )
  );
};

const isGuestAllowedByRoomGender = (
  room: Room,
  gender: string | null | undefined
): boolean => {
  const restriction = normalize(room.genderRestriction || "ANY");
  return restriction === "ANY" ||
    restriction === normalize(gender);
};

const getRoomGenderLabel = (
  room: Room,
  isMarathi: boolean
): string | null => {
  const restriction = normalize(room.genderRestriction || "ANY");
  if (restriction === "MALE") {
    return isMarathi ? "फक्त पुरुष" : "Male guests only";
  }
  if (restriction === "FEMALE") {
    return isMarathi ? "फक्त महिला" : "Female guests only";
  }
  return null;
};

const formatAuthorityRole = (role: string): string => {
  const labels: Record<string, string> = {
    DY_DIRECTOR: "Deputy Director",
    SUPERINTENDENT: "Superintendent",
    WELFARE_ORGANISER: "Welfare Organiser",
    OLC_REST_HOUSE_MANAGER: "OLC Rest House Manager",
  };

  return labels[role] ?? role.replace(/_/g, " ");
};

const roomNumber = (room: Room): number => {
  const match = room.name.match(/(\d+)/);
  return match ? Number(match[1]) : 9999;
};

const isVipRoom = (room: Room): boolean => {
  const name = normalize(room.name);
  const category = normalize(room.category);

  if (["AC", "NAC", "NON_AC", "DM", "DORMITORY", "HALL"].includes(category)) {
    return false;
  }
  if (category === "VIP" || category === "AC_VIP") return true;
  return name.includes("VIP");
};

const isAcRoom = (room: Room): boolean => {
  const name = normalize(room.name);
  const category = normalize(room.category);

  if (isVipRoom(room)) {
    return false;
  }

  if (category) {
    return category === "AC";
  }

  return (
    name.startsWith("AC") && !name.includes("VIP")
  );
};

const isNacRoom = (room: Room): boolean => {
  const name = normalize(room.name);
  const category = normalize(room.category);

  if (category) return category === "NAC" || category === "NON_AC";
  return name.startsWith("NAC");
};

const isDmRoom = (room: Room): boolean => {
  const name = normalize(room.name);
  const category = normalize(room.category);

  if (category) return category === "DM" || category === "DORMITORY";
  return name.startsWith("DM");
};

const isHallRoom = (room: Room): boolean => {
  const name = normalize(room.name);
  const category = normalize(room.category);

  if (category) return category === "HALL";
  return name === "HALL";
};

const isWholeRoom = (room: Room): boolean =>
  isAcRoom(room) ||
  isNacRoom(room) ||
  isVipRoom(room);

const isBedRoom = (room: Room): boolean =>
  isDmRoom(room) || isHallRoom(room);

const getRoomGroup = (
  room: Room
): "AC" | "NAC" | "VIP" | "DM" | "HALL" | "OTHER" => {
  if (isVipRoom(room)) return "VIP";
  if (isAcRoom(room)) return "AC";
  if (isNacRoom(room)) return "NAC";
  if (isDmRoom(room)) return "DM";
  if (isHallRoom(room)) return "HALL";

  return "OTHER";
};

function Availability({
  category: _category,
  role,
  booking,
  authoritySelection,
  initialSelections,
  onBack,
  onConfirmBooking,
  onSelectionsChange,
}: AvailabilityProps) {
  const { language, setLanguage } = useLanguage();

  const isMarathi = language === "mr";

  const tr = (english: string, marathi: string) =>
    isMarathi ? marathi : english;

  const [databaseRooms, setDatabaseRooms] = useState<Room[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState(
    () => toLocalDateInputValue()
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [roomError, setRoomError] = useState("");
  const [roomCapacities, setRoomCapacities] = useState<RoomCapacity[]>([]);
  const [capacityError, setCapacityError] = useState("");
  const [bookingDocuments, setBookingDocuments] =
    useState<BookingDocument[]>([]);
  const [documentsError, setDocumentsError] = useState("");
  const [selectedBeds, setSelectedBeds] = useState<BedSelection[]>(
    initialSelections ?? []
  );
  const [detailsRoomId, setDetailsRoomId] =
    useState<string | null>(null);
  const [unavailableRoomId, setUnavailableRoomId] = useState<string | null>(
    null
  );

  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth]
  );
  const monthNames = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) =>
        new Date(2020, month, 1).toLocaleDateString(
          language === "mr" ? "mr-IN" : "en-IN",
          { month: "long" }
        )
      ),
    [language]
  );
  const calendarYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 26 }, (_, index) => currentYear - 5 + index);
  }, []);

  const requiredGuests = booking?.guests.length ?? 1;

  const isAuthorityBooking = Boolean(authoritySelection);

  useEffect(() => {
    if (booking?.id) {
      onSelectionsChange?.(selectedBeds);
    }
  }, [booking?.id, onSelectionsChange, selectedBeds]);

  /*
   * ==========================================
   * LANGUAGE SWITCHER
   * ==========================================
   */

  const languageSwitcher = (
    <div className="language-switcher" aria-label="Language selection">
      <button
        type="button"
        className={`language-button ${
          language === "en" ? "active" : ""
        }`}
        onClick={() => setLanguage("en")}
      >
        English
      </button>

      <span className="language-divider">|</span>

      <button
        type="button"
        className={`language-button ${
          language === "mr" ? "active" : ""
        }`}
        onClick={() => setLanguage("mr")}
      >
        मराठी
      </button>
    </div>
  );

  /*
   * ==========================================
   * STATUS LABEL
   * ==========================================
   */

  const getStatusLabel = (status: BedStatus) => {
    switch (status) {
      case "available":
        return tr("Available", "उपलब्ध");

      case "reserved":
        return tr("Reserved", "आरक्षित");

      case "occupied":
        return tr("Occupied", "व्यापलेले");

      case "booked":
        return tr("Booked", "बुक केलेले");

      case "needs_cleaning":
        return tr("Needs Cleaning", "साफसफाई आवश्यक");

      case "cleaning":
        return tr(
          "Housekeeping / Cleaning",
          "हाऊसकीपिंग / साफसफाई"
        );

      case "out":
        return tr("Out of Service", "सेवेबाहेर");

      default:
        return tr("Not Available", "उपलब्ध नाही");
    }
  };

  /*
   * ==========================================
   * LOAD ROOMS
   *
   * IMPORTANT:
   * Direct Availability is an inventory screen.
   * It must not depend on booking being present.
   * ==========================================
   */

  useEffect(() => {
    let cancelled = false;

    const loadRooms = async (silent = false) => {
      try {
        if (!silent) {
          setIsLoadingRooms(true);
        }
        setRoomError("");

        if (!booking && !silent) {
          setSelectedBeds([]);
          setUnavailableRoomId(null);
        }

        /*
         * Authority booking:
         * only load rooms permitted for the authority flow.
         *
         * Normal booking / direct availability:
         * use the normal room endpoint.
         *
         * We intentionally keep this independent of
         * whether booking exists.
         */
        const query = new URLSearchParams();

        if (booking?.checkIn) {
          query.set(
            "check_in_date",
            booking.checkIn.slice(0, 10)
          );
        }

        if (!booking && !authoritySelection && availabilityDate) {
          query.set("check_in_date", availabilityDate);
          query.set("expected_check_out_date", addOneDay(availabilityDate));
        }

        if (booking?.checkOut) {
          query.set(
            "expected_check_out_date",
            booking.checkOut.slice(0, 10)
          );
        }

        const dateQuery = query.toString();
        const endpoint = authoritySelection
          ? `http://localhost:5000/api/rooms/authority-rooms?${dateQuery}`
          : `http://localhost:5000/api/rooms?${dateQuery}`;

        const response = await apiFetch(endpoint, {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.message ||
              tr(
                "Unable to load rooms.",
                "खोल्या लोड करता आल्या नाहीत."
              )
          );
        }

        if (!Array.isArray(data.rooms)) {
          throw new Error(
            tr(
              "Room data was not returned correctly by the server.",
              "सर्व्हरकडून खोलीची माहिती योग्य प्रकारे प्राप्त झाली नाही."
            )
          );
        }

        const rooms: Room[] = await Promise.all(
          data.rooms.map(
            async (room: {
              id: string;
              room_number: string;
              total_beds: number;
              category_name?: string;
              approval_authority_role?: string | null;
              is_other_authority_room?: boolean;
              current_status?: string;
              is_under_maintenance?: boolean;
              allowed_gender?: string | null;
              room_usage?: string;
              is_bookable?: boolean;
              gender_restriction?: string;
              room_note?: string | null;
              assignments?: RoomAssignment[];
            }) => {
              const bedQuery =
                dateQuery
                  ? `?${dateQuery}`
                  : "";

              const bedsResponse = await apiFetch(
                `http://localhost:5000/api/rooms/${room.id}/beds${bedQuery}`,
                { cache: "no-store" }
              );

              const bedsData = await bedsResponse.json();

              if (!bedsResponse.ok || !bedsData.success) {
                throw new Error(
                  tr(
                    `Unable to load beds for ${room.room_number}.`,
                    `${room.room_number} साठी बेड लोड करता आले नाहीत.`
                  )
                );
              }

              const beds: Bed[] = Array.isArray(bedsData.beds)
                ? bedsData.beds.map(
                    (bed: {
                      id: string;
                      bed_number: number;
                      bed_status: string;
                    }) => {
                      let status: BedStatus = "out";

                      switch (normalize(bed.bed_status)) {
                        case "AVAILABLE":
                          status = "available";
                          break;

                        case "RESERVED":
                          status = "reserved";
                          break;

                        case "OCCUPIED":
                          status = "occupied";
                          break;

                        case "BOOKED":
                          status = "booked";
                          break;

                        case "NEEDS_CLEANING":
                          status = "needs_cleaning";
                          break;

                        case "CLEANING":
                        case "HOUSEKEEPING_CLEANING":
                          status = "cleaning";
                          break;

                        default:
                          status = "out";
                      }

                      return {
                        id: bed.id,
                        number: bed.bed_number,
                        status,
                      };
                    }
                  )
                : [];

              return {
                id: room.id,
                name: room.room_number,
                category: room.category_name,
                genderRestriction: room.gender_restriction ?? "ANY",
                roomNote: room.room_note ?? null,
                approvalAuthorityRole:
                  room.approval_authority_role ?? null,
                isOtherAuthorityRoom:
                  Boolean(room.is_other_authority_room),
                currentStatus:
                  room.current_status || "",
                isUnderMaintenance:
                  Boolean(room.is_under_maintenance),
                totalBeds: room.total_beds,
                allowedGender: room.allowed_gender ?? null,
                usage: room.room_usage ?? "GUEST",
                assignments:
                  room.assignments || [],
                beds,
              };
            }
          )
        );

        if (!silent) {
          try {
            const capacityResponse = await apiFetch(
              "http://localhost:5000/api/rooms/capacities",
              { cache: "no-store" }
            );
            const capacityData = await capacityResponse.json();
            if (!capacityResponse.ok || !capacityData.success) {
              throw new Error(
                capacityData.message || "Unable to load room capacity settings."
              );
            }
            if (!cancelled) {
              setRoomCapacities(
                Array.isArray(capacityData.capacities)
                  ? capacityData.capacities
                  : []
              );
              setCapacityError("");
            }
          } catch (error) {
            if (!cancelled) {
              setCapacityError(
                error instanceof Error
                  ? error.message
                  : "Unable to load room capacity settings."
              );
            }
          }

          if (booking?.id) {
            try {
              const documentsResponse = await apiFetch(
                `http://localhost:5000/api/bookings/${booking.id}/documents`,
                { cache: "no-store" }
              );
              const documentsData = await documentsResponse.json();
              if (!documentsResponse.ok || !documentsData.success) {
                throw new Error(
                  documentsData.message || "Unable to load booking documents."
                );
              }
              if (!cancelled) {
                setBookingDocuments(
                  Array.isArray(documentsData.documents)
                    ? documentsData.documents
                    : []
                );
                setDocumentsError("");
              }
            } catch (error) {
              if (!cancelled) {
                setDocumentsError(
                  error instanceof Error
                    ? error.message
                    : "Unable to load booking documents."
                );
              }
            }
          }
        }

        if (!cancelled) {
          setDatabaseRooms(rooms);
        }
      } catch (error) {
        console.error("Room loading error:", error);

        if (!cancelled) {
          setRoomError(
            error instanceof Error
              ? error.message
              : tr(
                  "Unable to load rooms from the backend.",
                  "बॅकएंडमधून खोल्या लोड करता आल्या नाहीत."
                )
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRooms(false);
        }
      }
    };

    loadRooms();

    const refreshRooms = () => {
      if (document.visibilityState === "visible") {
        void loadRooms(true);
      }
    };

    const refreshTimer = window.setInterval(
      refreshRooms,
      30000
    );
    window.addEventListener("focus", refreshRooms);
    document.addEventListener("visibilitychange", refreshRooms);

    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshRooms);
      document.removeEventListener("visibilitychange", refreshRooms);
    };
  }, [
    role,
    availabilityDate,
    booking?.checkIn,
    booking?.checkOut,
    authoritySelection?.roomId,
    authoritySelection?.isMatrixRoom,
    authoritySelection?.bedId,
    booking,
  ]);

  const downloadBookingDocument = async (documentId: string) => {
    if (!booking?.id) {
      return;
    }
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/bookings/${booking.id}/documents/${documentId}`
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Unable to download booking document.");
      }
      const blob = await response.blob();
      const extension =
        blob.type === "application/pdf"
          ? "pdf"
          : blob.type === "image/png"
            ? "png"
            : "jpg";
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `booking-document-${documentId}.${extension}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      setDocumentsError(
        error instanceof Error
          ? error.message
          : "Unable to download booking document."
      );
    }
  };

  /*
   * ==========================================
   * SORT ROOMS
   * ==========================================
   */

  const allRooms = useMemo(() => {
    return [...databaseRooms].sort((a, b) => {
      const groupOrder: Record<string, number> = {
        AC: 1,
        VIP: 2,
        NAC: 3,
        DM: 4,
        HALL: 5,
        OTHER: 6,
      };

      const groupDifference =
        groupOrder[getRoomGroup(a)] -
        groupOrder[getRoomGroup(b)];

      if (groupDifference !== 0) {
        return groupDifference;
      }

      return roomNumber(a) - roomNumber(b);
    });
  }, [databaseRooms]);

  const acRooms = useMemo(
    () =>
      allRooms
        .filter(isAcRoom)
        .sort((a, b) => roomNumber(a) - roomNumber(b)),
    [allRooms]
  );

  const vipRooms = useMemo(
    () =>
      allRooms
        .filter(isVipRoom)
        .sort((a, b) => roomNumber(a) - roomNumber(b)),
    [allRooms]
  );

  const nacRooms = useMemo(
    () =>
      allRooms
        .filter(isNacRoom)
        .sort((a, b) => roomNumber(a) - roomNumber(b)),
    [allRooms]
  );

  const dmRooms = useMemo(
    () =>
      allRooms
        .filter(isDmRoom)
        .sort((a, b) => roomNumber(a) - roomNumber(b)),
    [allRooms]
  );

  const hallRooms = useMemo(
    () => allRooms.filter(isHallRoom),
    [allRooms]
  );

  /*
   * ==========================================
   * ROOM STATUS
   * ==========================================
   */

  const getRoomStatus = (room: Room) => {
    const total =
      room.totalBeds ?? room.beds.length;
    const currentRoomStatus =
      normalize(room.currentStatus);

    const available = room.beds.filter(
      (b) => b.status === "available"
    ).length;

    const occupied = room.beds.filter(
      (b) => b.status === "occupied"
    ).length;

    const booked = room.beds.filter(
      (b) => b.status === "booked"
    ).length;

    const reserved = room.beds.filter(
      (b) => b.status === "reserved"
    ).length;

    const needsCleaning = room.beds.filter(
      (b) => b.status === "needs_cleaning"
    ).length;

    const cleaning = room.beds.filter(
      (b) => b.status === "cleaning"
    ).length;

    const out = room.beds.filter(
      (b) => b.status === "out"
    ).length;

    if (room.currentStatus === "STORE") {
      return {
        label: tr("Store Room", "साठवण खोली"),
        status: "out" as BedStatus,
        available: 0,
        total,
      };
    }

    if (
      room.isUnderMaintenance ||
      currentRoomStatus === "MAINTENANCE"
    ) {
      return {
        label: tr("Under Maintenance", "दुरुस्ती सुरू"),
        status: "out" as BedStatus,
        available: 0,
        total,
      };
    }

    const isDirectAvailabilityView =
      !booking && !authoritySelection;

    if (
      isWholeRoom(room) &&
      !(booking?.checkIn && booking.checkOut) &&
      !isDirectAvailabilityView
    ) {
      const roomStatus: Partial<
        Record<
          string,
          {
            label: string;
            status: BedStatus;
          }
        >
      > = {
        NEEDS_CLEANING: {
          label: tr("Needs Cleaning", "साफसफाई आवश्यक"),
          status: "needs_cleaning",
        },
        CLEANING: {
          label: tr("Cleaning", "साफसफाई सुरू आहे"),
          status: "cleaning",
        },
        OCCUPIED: {
          label: tr("Occupied", "व्यापलेले"),
          status: "occupied",
        },
        RESERVED: {
          label: tr("Reserved", "आरक्षित"),
          status: "reserved",
        },
      };
      const currentStatus = roomStatus[currentRoomStatus];

      if (currentStatus) {
        return {
          ...currentStatus,
          available: 0,
          total,
        };
      }
    }

    if (total === 0 || out === total) {
      return {
        label: tr("Out of Service", "सेवेबाहेर"),
        status: "out" as BedStatus,
        available,
        total,
      };
    }

    if (cleaning > 0) {
      return {
        label: tr("Cleaning", "साफसफाई सुरू आहे"),
        status: "cleaning" as BedStatus,
        available,
        total,
      };
    }

    if (needsCleaning > 0) {
      return {
        label: tr("Needs Cleaning", "साफसफाई आवश्यक"),
        status: "needs_cleaning" as BedStatus,
        available,
        total,
      };
    }

    if (available === total) {
      return {
        label: tr("Available", "उपलब्ध"),
        status: "available" as BedStatus,
        available,
        total,
      };
    }

    if (occupied > 0 && available === 0) {
      return {
        label: tr("Occupied", "व्यापलेले"),
        status: "occupied" as BedStatus,
        available,
        total,
      };
    }

    if (booked > 0 && available === 0) {
      return {
        label: tr("Booked", "बुक केलेले"),
        status: "booked" as BedStatus,
        available,
        total,
      };
    }

    if (reserved > 0 && available === 0) {
      return {
        label: tr("Reserved", "आरक्षित"),
        status: "reserved" as BedStatus,
        available,
        total,
      };
    }

    return {
      label: tr("Not Available", "उपलब्ध नाही"),
      status: "unavailable" as BedStatus,
      available,
      total,
    };
  };

  /*
   * ==========================================
   * SELECTION STATE
   * ==========================================
   */

  const selectedWholeRoomId = selectedBeds.find(
    (s) => !s.bedId
  )?.roomId;

  const selectedWholeRoom = selectedWholeRoomId
    ? databaseRooms.find(
        (room) => room.id === selectedWholeRoomId
      )
    : undefined;

  const selectedMatrixBeds = selectedBeds.filter(
    (s) => Boolean(s.bedId)
  );

  const getConfiguredOccupantCapacity = (room: Room): number => {
    const capacity = roomCapacities.find(
      (item) => item.room_id === room.id
    );
    const capacities = [
      room.totalBeds ?? room.beds.length,
      capacity?.room_capacity,
      capacity?.bed_capacity,
    ]
      .filter((value): value is number | string => value !== null && value !== undefined)
      .map(Number)
      .filter((value) => Number.isFinite(value) && value >= 0);
    return capacities.length > 0
      ? Math.min(...capacities)
      : room.totalBeds ?? room.beds.length;
  };

  const renderRoomRates = (room: Room) => {
    const rateCard = roomCapacities.find(
      (item) => item.room_id === room.id
    );
    const formatRate = (value: number | string | null | undefined) => {
      const amount = Number(value);
      return value === null || value === undefined || !Number.isFinite(amount) || amount <= 0
        ? tr("Not configured", "दर सेट केलेला नाही")
        : `₹${amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`;
    };

    return (
      <div className="room-rate-facts">
        <strong>{tr("Per night", "प्रति रात्र")}</strong>
        <span>ESM: {formatRate(rateCard?.esm_room_rate)}</span>
        <span>{tr("Serving", "सेवारत")}: {formatRate(rateCard?.serving_room_rate)}</span>
        <span>{tr("Civilian", "नागरिक")}: {formatRate(rateCard?.civilian_room_rate)}</span>
      </div>
    );
  };

  const hasWholeRoomSelection = Boolean(selectedWholeRoom);

  const hasBedSelection = selectedMatrixBeds.length > 0;

  const selectionMode: "ROOM" | "BED" | "NONE" =
    hasBedSelection
      ? "BED"
      : hasWholeRoomSelection
      ? "ROOM"
      : "NONE";

  /*
   * ==========================================
   * AVAILABILITY COUNTERS
   * ==========================================
   */

  const availableWholeRooms = useMemo(
    () =>
      [...acRooms, ...vipRooms, ...nacRooms].filter(
        (room) => {
          const status = getRoomStatus(room);

          return (
            status.total > 0 &&
            status.available === status.total
          );
        }
      ).length,
    [acRooms, vipRooms, nacRooms]
  );

  /*
   * ==========================================
   * ROOM SELECTION
   * ==========================================
   */

  const handleRoomSelection = (room: Room) => {
    if (!booking || !isWholeRoom(room)) {
      return;
    }

    if (
      authoritySelection &&
      room.id !== authoritySelection.roomId
    ) {
      return;
    }

    const status = getRoomStatus(room);

    if (status.total === 0) {
      setUnavailableRoomId(room.id);

      setRoomError(
        tr(
          `${room.name} is not available for allocation.`,
          `${room.name} वाटपासाठी उपलब्ध नाही.`
        )
      );

      return;
    }

    if (status.available !== status.total) {
      setUnavailableRoomId(room.id);

      setRoomError(
        tr(
          `${room.name} is not fully available and cannot be allotted.`,
          `${room.name} पूर्णपणे उपलब्ध नाही आणि ती दिली जाऊ शकत नाही.`
        )
      );

      return;
    }

    if (
      Math.min(
        status.total,
        getConfiguredOccupantCapacity(room)
      ) < requiredGuests
    ) {
      setUnavailableRoomId(room.id);

      setRoomError(
        tr(
          `${room.name} cannot accommodate this booking.`,
          `${room.name} या बुकिंगसाठी योग्य नाही.`
        )
      );

      return;
    }

    setUnavailableRoomId(null);

    const roomSelections: BedSelection[] =
      booking.guests.map((guest) => ({
        roomId: room.id,
        roomName: room.name,
        bedId: "",
        bedNumber: 0,
        occupantName: guest.name || "",
        guestId: guest.id || "",
      }));

    setSelectedBeds(roomSelections);
    setRoomError("");
  };

  /*
   * ==========================================
   * BED SELECTION
   * ==========================================
   */

  const handleBedClick = (room: Room, bed: Bed) => {
    if (!booking || !isBedRoom(room)) {
      return;
    }

    if (bed.status !== "available") {
      return;
    }

    if (
      authoritySelection &&
      room.id !== authoritySelection.roomId
    ) {
      return;
    }

    if (
      authoritySelection?.isMatrixRoom &&
      authoritySelection.bedId &&
      bed.id !== authoritySelection.bedId
    ) {
      return;
    }

    const alreadySelected = selectedBeds.some(
      (s) => s.bedId === bed.id
    );

    if (alreadySelected) {
      if (authoritySelection) {
        return;
      }

      setSelectedBeds((current) =>
        current.filter(
          (selection) =>
            selection.bedId !== bed.id
        )
      );

      return;
    }

    if (selectedBeds.length >= requiredGuests) {
      return;
    }

    const previouslySelectedRoom =
      selectedBeds.length > 0
        ? databaseRooms.find(
            (candidate) =>
              candidate.id === selectedBeds[0].roomId
          )
        : undefined;
    if (
      previouslySelectedRoom &&
      (previouslySelectedRoom.approvalAuthorityRole ?? null) !==
        (room.approvalAuthorityRole ?? null)
    ) {
      setRoomError(
        tr(
          "A single booking must use rooms reviewed by the same approving authority. Clear the current selection before choosing this room.",
          "एका बुकिंगमधील खोल्यांची मंजुरी एकाच अधिकाऱ्याकडून होणे आवश्यक आहे. ही खोली निवडण्यापूर्वी सध्याची निवड काढा."
        )
      );
      return;
    }

    const selectedInRoom = selectedBeds.filter(
      (selection) => selection.roomId === room.id
    ).length;
    if (
      selectedInRoom >= getConfiguredOccupantCapacity(room)
    ) {
      setRoomError(
        tr(
          `${room.name} has reached its configured occupant capacity.`,
          `${room.name} ची सेट केलेली क्षमता पूर्ण झाली आहे.`
        )
      );
      return;
    }

    const nextGuest =
      booking.guests[selectedBeds.length];

    if (!nextGuest) {
      return;
    }
    if (!isGuestAllowedByRoomGender(room, nextGuest.gender)) {
      setRoomError(
        tr(
          `${room.name} is restricted to ${getRoomGenderLabel(room, false)}.`,
          `${room.name} मध्ये ${getRoomGenderLabel(room, true)} अतिथीच राहू शकतात.`
        )
      );
      return;
    }

    setSelectedBeds((current) => [
      ...current,
      {
        roomId: room.id,
        roomName: room.name,
        bedId: bed.id,
        bedNumber: bed.number,
        occupantName: nextGuest.name || "",
        guestId: nextGuest.id || "",
      },
    ]);

    setRoomError("");
  };

  /*
   * ==========================================
   * ASSIGN GUEST
   * ==========================================
   */

  const assignGuest = (
    bedId: string,
    guestId: string
  ) => {
    const guest = booking?.guests.find(
      (g) => g.id === guestId
    );
    const selection = selectedBeds.find(
      (item) => item.bedId === bedId
    );
    const room = databaseRooms.find(
      (item) => item.id === selection?.roomId
    );

    if (
      guest &&
      room &&
      !isGuestAllowedByRoomGender(room, guest.gender)
    ) {
      setRoomError(
        tr(
          `${room.name} is restricted to ${getRoomGenderLabel(room, false)}.`,
          `${room.name} मध्ये ${getRoomGenderLabel(room, true)} अतिथीच राहू शकतात.`
        )
      );
      return;
    }

    const duplicate = selectedBeds.some(
      (selection) =>
        selection.bedId !== bedId &&
        selection.guestId === guestId
    );

    if (guestId && duplicate) {
      return;
    }

    setSelectedBeds((current) =>
      current.map((selection) =>
        selection.bedId === bedId
          ? {
              ...selection,
              guestId: guestId || "",
              occupantName: guest?.name || "",
            }
          : selection
      )
    );
  };

  /*
   * ==========================================
   * CLEAR
   * ==========================================
   */

  const clearSelection = () => {
    if (authoritySelection) {
      return;
    }

    setSelectedBeds([]);
    setRoomError("");
    setUnavailableRoomId(null);
  };

  /*
   * ==========================================
   * AUTHORITY SELECTION
   * ==========================================
   */

  useEffect(() => {
    if (
      !booking ||
      !authoritySelection ||
      databaseRooms.length === 0
    ) {
      return;
    }

    const lockedRoom = databaseRooms.find(
      (room) =>
        room.id === authoritySelection.roomId
    );

    if (!lockedRoom) {
      setRoomError(
        tr(
          `The selected authority room ${authoritySelection.roomNumber} could not be loaded.`,
          `निवडलेली अधिकृत खोली ${authoritySelection.roomNumber} लोड करता आली नाही.`
        )
      );

      return;
    }

    if (authoritySelection.isMatrixRoom) {
      if (!authoritySelection.bedId) {
        setRoomError(
          tr(
            `No bed was selected for ${authoritySelection.roomNumber}.`,
            `${authoritySelection.roomNumber} साठी कोणताही बेड निवडलेला नाही.`
          )
        );

        return;
      }

      const lockedBed = lockedRoom.beds.find(
        (bed) =>
          bed.id === authoritySelection.bedId
      );

      if (!lockedBed) {
        setRoomError(
          tr(
            `Selected bed could not be found in ${authoritySelection.roomNumber}.`,
            `${authoritySelection.roomNumber} मध्ये निवडलेला बेड सापडला नाही.`
          )
        );

        return;
      }

      if (lockedBed.status !== "available") {
        setRoomError(
          tr(
            `Bed ${authoritySelection.bedNumber ?? ""} in ${authoritySelection.roomNumber} is no longer available.`,
            `${authoritySelection.roomNumber} मधील बेड ${authoritySelection.bedNumber ?? ""} आता उपलब्ध नाही.`
          )
        );

        return;
      }

      const guest = booking.guests[0];

      if (!guest) {
        return;
      }
      if (!isGuestAllowedByRoomGender(lockedRoom, guest.gender)) {
        setRoomError(
          tr(
            `${lockedRoom.name} is not available for this guest's gender.`,
            `${lockedRoom.name} या अतिथीच्या लिंगासाठी उपलब्ध नाही.`
          )
        );
        return;
      }

      setSelectedBeds([
        {
          roomId: lockedRoom.id,
          roomName: lockedRoom.name,
          bedId: lockedBed.id,
          bedNumber: lockedBed.number,
          occupantName: guest.name || "",
          guestId: guest.id || "",
        },
      ]);

      return;
    }

    const status = getRoomStatus(lockedRoom);

    if (status.available !== status.total) {
      setRoomError(
        tr(
          `${authoritySelection.roomNumber} is not fully available.`,
          `${authoritySelection.roomNumber} पूर्णपणे उपलब्ध नाही.`
        )
      );

      return;
    }

    if (status.total < requiredGuests) {
      setRoomError(
        tr(
          `${authoritySelection.roomNumber} does not have enough capacity for this booking.`,
          `${authoritySelection.roomNumber} मध्ये या बुकिंगसाठी पुरेशी क्षमता नाही.`
        )
      );

      return;
    }

    setSelectedBeds(
      booking.guests.map((guest) => ({
        roomId: lockedRoom.id,
        roomName: lockedRoom.name,
        bedId: "",
        bedNumber: 0,
        occupantName: guest.name || "",
        guestId: guest.id || "",
      }))
    );
  }, [
    booking,
    authoritySelection,
    databaseRooms,
    requiredGuests,
  ]);

  /*
   * ==========================================
   * CONFIRM
   * ==========================================
   */

  const handleConfirm = () => {
    if (!booking) {
      return;
    }

    if (selectionMode === "ROOM") {
      if (!hasWholeRoomSelection) {
        return;
      }

      if (selectedBeds.length !== requiredGuests) {
        return;
      }

      if (
        selectedBeds.some(
          (selection) => Boolean(selection.bedId)
        )
      ) {
        return;
      }
    }

    if (selectionMode === "BED") {
      if (
        selectedMatrixBeds.length !==
        requiredGuests
      ) {
        return;
      }

      if (
        selectedMatrixBeds.some(
          (selection) =>
            !selection.guestId ||
            !selection.occupantName
        )
      ) {
        return;
      }
    }

    const guestIds = selectedBeds.map(
      (selection) => selection.guestId
    );

    if (
      new Set(guestIds).size !==
      guestIds.length
    ) {
      return;
    }
    if (
      selectedBeds.some((selection) => {
        const room = databaseRooms.find(
          (item) => item.id === selection.roomId
        );
        const guest = booking.guests.find(
          (item) => item.id === selection.guestId
        );
        return Boolean(
          room &&
          guest &&
          !isGuestAllowedByRoomGender(room, guest.gender)
        );
      })
    ) {
      return;
    }

    if (authoritySelection) {
      if (
        selectedBeds.some(
          (selection) =>
            selection.roomId !==
            authoritySelection.roomId
        )
      ) {
        return;
      }

      if (
        authoritySelection.isMatrixRoom &&
        authoritySelection.bedId
      ) {
        if (
          selectedBeds.some(
            (selection) =>
              selection.bedId !==
              authoritySelection.bedId
          )
        ) {
          return;
        }
      }
    }

    onConfirmBooking(selectedBeds);
  };

  /*
   * ==========================================
   * WHOLE ROOM CARD
   * ==========================================
   */

  const renderWholeRoomCard = (room: Room) => {
    const status = getRoomStatus(room);
    const capacity = getConfiguredOccupantCapacity(room);

    const selected =
      selectedWholeRoomId === room.id;

    const selectable =
      status.total >= requiredGuests &&
      status.available === status.total;

    return (
      <div
        className={`room-section status-${status.status}`}
        key={room.id}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(
              "button, select, input, a"
            )
          ) {
            return;
          }

          setDetailsRoomId(room.id);
        }}
        style={{ cursor: "pointer" }}
      >
        <div className="room-title">
          <div className="room-title-details">
            <h2>{room.name}</h2>
            {getRoomGenderLabel(room, isMarathi) && (
              <span className="room-gender-restriction-badge">
                {getRoomGenderLabel(room, isMarathi)}
              </span>
            )}

            {role === "RECEPTIONIST" &&
              room.isOtherAuthorityRoom &&
              room.approvalAuthorityRole && (
                <span className="room-authority-approval-badge">
                  {tr("Approval:", "मंजुरी:")}{" "}
                  {formatAuthorityRole(room.approvalAuthorityRole)}
                </span>
              )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              className={`room-status ${status.status}`}
            >
              {status.label}
            </span>

            <button
              type="button"
              onClick={() =>
                setDetailsRoomId(room.id)
              }
              aria-label={tr(
                `View details for ${room.name}`,
                `${room.name} ची माहिती पहा`
              )}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "7px 10px",
                background: "#fff",
                color: "#1f4d36",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {tr("Details", "तपशील")}
            </button>
          </div>
        </div>

        <div className="room-capacity-facts">
          <span>
            {tr("Bed capacity", "बेड क्षमता")}: {capacity}
          </span>
          {room.allowedGender && (
            <span>
              {room.allowedGender === "MALE"
                ? tr("Male only", "फक्त पुरुष")
                : tr("Female only", "फक्त महिला")}
            </span>
          )}
          {room.usage && room.usage !== "GUEST" && (
            <span>{room.usage.replaceAll("_", " ")}</span>
          )}
        </div>
        {renderRoomRates(room)}

        {booking ? (
          <div
            className="room-action-row"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              minHeight: "52px",
              paddingTop: "4px",
            }}
          >
            <button
              type="button"
              className="continue-booking-button"
              disabled={!selectable || selected}
              onClick={() =>
                handleRoomSelection(room)
              }
            >
              {selected
                ? tr(
                    "ROOM SELECTED ✓",
                    "खोली निवडली ✓"
                  )
                : status.status === "occupied"
                ? tr("OCCUPIED", "व्यापलेले")
                : status.status === "booked"
                ? tr("BOOKED", "बुक केलेले")
                : status.status ===
                  "needs_cleaning"
                ? tr(
                    "WAITING FOR HOUSEKEEPING",
                    "हाऊसकीपिंगची प्रतीक्षा"
                  )
                : status.status === "cleaning"
                ? tr(
                    "CLEANING IN PROGRESS",
                    "साफसफाई सुरू आहे"
                  )
                : status.status === "reserved"
                ? tr("RESERVED", "आरक्षित")
                : status.status === "out"
                ? tr(
                    "OUT OF SERVICE",
                    "सेवेबाहेर"
                  )
                : status.status ===
                  "unavailable"
                ? tr(
                    "ROOM NOT AVAILABLE",
                    "खोली उपलब्ध नाही"
                  )
                : status.total < requiredGuests
                ? tr(
                    "ROOM TOO SMALL FOR THIS BOOKING",
                    "पुरेशी क्षमता नाही"
                  )
                : selectable
                ? tr(
                    "SELECT ROOM →",
                    "खोली निवडा →"
                  )
                : tr(
                    "ROOM NOT AVAILABLE",
                    "खोली उपलब्ध नाही"
                  )}
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  /*
   * ==========================================
   * BED ROOM
   * ==========================================
   */

  const renderBedRoom = (room: Room) => {
    const status = getRoomStatus(room);
    const capacity = getConfiguredOccupantCapacity(room);

    return (
      <div
        className={`room-section status-${status.status}`}
        key={room.id}
        onClick={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest(
              "button, select, input, a"
            )
          ) {
            return;
          }

          setDetailsRoomId(room.id);
        }}
        style={{ cursor: "pointer" }}
      >
        <div className="room-title">
          <div className="room-title-details">
            <h2>{room.name}</h2>

            {getRoomGenderLabel(room, isMarathi) && (
              <span className="room-gender-restriction-badge">
                {getRoomGenderLabel(room, isMarathi)}
              </span>
            )}

            {role === "RECEPTIONIST" &&
              room.isOtherAuthorityRoom &&
              room.approvalAuthorityRole && (
                <span className="room-authority-approval-badge">
                  {tr("Approval:", "मंजुरी:")}{" "}
                  {formatAuthorityRole(room.approvalAuthorityRole)}
                </span>
              )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              className={`room-status ${status.status}`}
            >
              {status.label}
            </span>

            <button
              type="button"
              onClick={() =>
                setDetailsRoomId(room.id)
              }
              aria-label={tr(
                `View details for ${room.name}`,
                `${room.name} ची माहिती पहा`
              )}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "7px 10px",
                background: "#fff",
                color: "#1f4d36",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {tr("Details", "तपशील")}
            </button>
          </div>
        </div>

        <div className="room-capacity-facts">
          <span>
            {tr("Bed capacity", "बेड क्षमता")}: {capacity}
          </span>
          {room.allowedGender && (
            <span>
              {room.allowedGender === "MALE"
                ? tr("Male only", "फक्त पुरुष")
                : tr("Female only", "फक्त महिला")}
            </span>
          )}
          {room.usage && room.usage !== "GUEST" && (
            <span>{room.usage.replaceAll("_", " ")}</span>
          )}
        </div>
        {renderRoomRates(room)}

        <div className="bed-grid">
          {room.beds.map((bed) => {
            const selected =
              selectedBeds.some(
                (selection) =>
                  selection.bedId === bed.id
              );

            const locked =
              Boolean(
                authoritySelection?.isMatrixRoom &&
                  authoritySelection.bedId ===
                    bed.id
              );

            const disabledByAuthority =
              Boolean(
                authoritySelection?.isMatrixRoom &&
                  !locked
              );

            return (
              <button
                key={bed.id}
                type="button"
                className={`bed-card ${bed.status} ${
                  selected ? "selected" : ""
                }`}
                disabled={
                  !booking ||
                  bed.status !== "available" ||
                  disabledByAuthority
                }
                onClick={() =>
                  handleBedClick(room, bed)
                }
              >
                <span className="bed-number">
                  {tr("Bed", "बेड")}{" "}
                  {bed.number}
                </span>

                <span className="bed-status">
                  {locked
                    ? tr("LOCKED", "लॉक केलेले")
                    : selected
                    ? tr(
                        "SELECTED",
                        "निवडलेले"
                      )
                    : getStatusLabel(
                        bed.status
                      )}
                </span>
              </button>
            );
          })}
        </div>

      </div>
    );
  };

  /*
   * ==========================================
   * REPLACEMENT ROOMS
   * ==========================================
   */

  const unavailableRoom = unavailableRoomId
    ? databaseRooms.find(
        (room) =>
          room.id === unavailableRoomId
      )
    : undefined;

  const replacementRooms = useMemo(() => {
    if (
      !unavailableRoom ||
      !booking ||
      authoritySelection
    ) {
      return [];
    }

    const group =
      getRoomGroup(unavailableRoom);

    return allRooms
      .filter(
        (room) =>
          room.id !== unavailableRoom.id
      )
      .filter(
        (room) =>
          getRoomGroup(room) === group
      )
      .filter(isWholeRoom)
      .filter((room) => {
        const status =
          getRoomStatus(room);

        return (
          status.total >= requiredGuests &&
          status.available ===
            status.total
        );
      })
      .sort(
        (a, b) =>
          roomNumber(a) -
          roomNumber(b)
      );
  }, [
    unavailableRoom,
    booking,
    authoritySelection,
    allRooms,
    requiredGuests,
  ]);

  /*
   * ==========================================
   * HEADER
   * ==========================================
   */

  const headerDescription =
    isAuthorityBooking
      ? authoritySelection?.isMatrixRoom
        ? tr(
            `Booking locked to ${authoritySelection.roomNumber}, Bed ${authoritySelection.bedNumber}. Approval remains with ${authoritySelection.authorityRole}.`,
            `बुकिंग ${authoritySelection.roomNumber}, बेड ${authoritySelection.bedNumber} साठी निश्चित आहे. मंजुरी ${authoritySelection.authorityRole} कडेच राहील.`
          )
        : tr(
            `Booking locked to ${authoritySelection?.roomNumber}. The complete room will be allotted. Approval remains with ${authoritySelection?.authorityRole}.`,
            `बुकिंग ${authoritySelection?.roomNumber} साठी निश्चित आहे. संपूर्ण खोली दिली जाईल. मंजुरी ${authoritySelection?.authorityRole} कडेच राहील.`
          )
      : booking
      ? tr(
          "Select a room for AC / NAC / VIP, or an exact bed / seat for DM / HALL.",
          "AC / NAC / VIP साठी संपूर्ण खोली किंवा DM / HALL साठी अचूक बेड / जागा निवडा."
        )
      : tr(
          `View room and bed availability for ${formatAvailabilityDate(
            availabilityDate,
            language
          )}.`,
          `${formatAvailabilityDate(
            availabilityDate,
            language
          )} ची खोली आणि बेड उपलब्धता पहा.`
        );

  const authorityRooms = authoritySelection
    ? databaseRooms.filter(
        (room) =>
          room.id === authoritySelection.roomId
      )
    : [];

  const visibleAcRooms = authoritySelection
    ? authorityRooms.filter(isAcRoom)
    : acRooms;

  const visibleVipRooms = authoritySelection
    ? authorityRooms.filter(isVipRoom)
    : vipRooms;

  const visibleNacRooms = authoritySelection
    ? authorityRooms.filter(isNacRoom)
    : nacRooms;

  const visibleDmRooms = authoritySelection
    ? authorityRooms.filter(isDmRoom)
    : dmRooms;

  const visibleHallRooms = authoritySelection
    ? authorityRooms.filter(isHallRoom)
    : hallRooms;

  const wholeRoomSections = [
    {
      group: "AC",
      rooms: visibleAcRooms,
      description: booking
        ? tr(
            "Choose an entire air-conditioned room for this booking.",
            "या बुकिंगसाठी संपूर्ण वातानुकूलित खोली निवडा."
          )
        : tr(
            "Air-conditioned room availability and current status.",
            "वातानुकूलित खोल्यांची उपलब्धता आणि सध्याची स्थिती."
          ),
    },
    {
      group: "NAC",
      rooms: visibleNacRooms,
      description: booking
        ? tr(
            "Choose an entire non-air-conditioned room for this booking.",
            "या बुकिंगसाठी संपूर्ण विनावातानुकूलित खोली निवडा."
          )
        : tr(
            "Non-air-conditioned room availability and current status.",
            "विनावातानुकूलित खोल्यांची उपलब्धता आणि सध्याची स्थिती."
          ),
    },
    {
      group: "VIP",
      rooms: visibleVipRooms,
      description: booking
        ? tr(
            "Choose an entire VIP room for this booking.",
            "या बुकिंगसाठी संपूर्ण VIP खोली निवडा."
          )
        : tr(
            "VIP room availability and current status.",
            "VIP खोल्यांची उपलब्धता आणि सध्याची स्थिती."
          ),
    },
  ] as const;

  /*
   * ==========================================
   * UI
   * ==========================================
   */

  return (
    <main className="availability-screen">
      <header className="availability-header">
        <div>
          <span className="section-label">
            {isAuthorityBooking
              ? tr(
                  "EXPLICIT AUTHORITY BOOKING",
                  "अधिकृत खोली बुकिंग"
                )
              : tr(
                  "AVAILABILITY",
                  "उपलब्धता"
                )}
          </span>

          <div className="availability-title-row">
            <h1>
              {tr(
                "Room & Bed Availability",
                "खोली आणि बेड उपलब्धता"
              )}
            </h1>

            {!booking && !authoritySelection && (
              <div className="availability-date-picker">
                <span className="availability-calendar-icon" aria-hidden="true">
                  ▦
                </span>
                <span className="availability-date-picker-text">
                  <small>
                    {tr("Check availability for", "या तारखेची उपलब्धता")}
                  </small>
                  <strong>
                    {formatAvailabilityDate(availabilityDate, language)}
                  </strong>
                </span>
                <button
                  type="button"
                  className="availability-calendar-button"
                  aria-label={tr(
                    "Open availability calendar",
                    "उपलब्धता दिनदर्शिका उघडा"
                  )}
                  title={tr("Choose a date", "तारीख निवडा")}
                  onClick={() => {
                    const selectedDate = new Date(
                      `${availabilityDate}T12:00:00`
                    );
                    setCalendarMonth(
                      new Date(
                        selectedDate.getFullYear(),
                        selectedDate.getMonth(),
                        1
                      )
                    );
                    setIsCalendarOpen((open) => !open);
                  }}
                >
                  {tr("Choose date", "तारीख निवडा")}
                </button>
                {isCalendarOpen && (
                  <div
                    className="availability-calendar-popover"
                    role="dialog"
                    aria-label={tr("Choose availability date", "उपलब्धतेसाठी तारीख निवडा")}
                  >
                    <div className="availability-calendar-controls">
                      <button
                        type="button"
                        className="availability-calendar-nav"
                        aria-label={tr("Previous month", "मागील महिना")}
                        onClick={() =>
                          setCalendarMonth(
                            (month) =>
                              new Date(
                                month.getFullYear(),
                                month.getMonth() - 1,
                                1
                              )
                          )
                        }
                      >
                        ‹
                      </button>
                      <select
                        aria-label={tr("Month", "महिना")}
                        value={calendarMonth.getMonth()}
                        onChange={(event) =>
                          setCalendarMonth(
                            (month) =>
                              new Date(
                                month.getFullYear(),
                                Number(event.target.value),
                                1
                              )
                          )
                        }
                      >
                        {monthNames.map((month, index) => (
                          <option value={index} key={month}>
                            {month}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={tr("Year", "वर्ष")}
                        value={calendarMonth.getFullYear()}
                        onChange={(event) =>
                          setCalendarMonth(
                            (month) =>
                              new Date(
                                Number(event.target.value),
                                month.getMonth(),
                                1
                              )
                          )
                        }
                      >
                        {calendarYears.map((year) => (
                          <option value={year} key={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="availability-calendar-nav"
                        aria-label={tr("Next month", "पुढील महिना")}
                        onClick={() =>
                          setCalendarMonth(
                            (month) =>
                              new Date(
                                month.getFullYear(),
                                month.getMonth() + 1,
                                1
                              )
                          )
                        }
                      >
                        ›
                      </button>
                    </div>
                    <div className="availability-calendar-grid" role="grid">
                      {Array.from({ length: 7 }, (_, day) => {
                        const weekday = new Date(2020, 5, 7 + day)
                          .toLocaleDateString(
                            language === "mr" ? "mr-IN" : "en-IN",
                            { weekday: "short" }
                          );
                        return (
                          <span
                            className="availability-calendar-weekday"
                            role="columnheader"
                            key={day}
                          >
                            {weekday}
                          </span>
                        );
                      })}
                      {calendarDays.map((day) => {
                        const dateKey = getDateKey(day);
                        const isCurrentMonth =
                          day.getMonth() === calendarMonth.getMonth();
                        const isSelected = dateKey === availabilityDate;
                        const isToday = dateKey === toLocalDateInputValue();
                        return (
                          <button
                            type="button"
                            role="gridcell"
                            key={dateKey}
                            className={[
                              "availability-calendar-day",
                              !isCurrentMonth ? "outside-month" : "",
                              isSelected ? "selected" : "",
                              isToday ? "today" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            aria-pressed={isSelected}
                            aria-label={formatAvailabilityDate(
                              dateKey,
                              language
                            )}
                            onClick={() => {
                              setAvailabilityDate(dateKey);
                              setCalendarMonth(
                                new Date(day.getFullYear(), day.getMonth(), 1)
                              );
                              setIsCalendarOpen(false);
                            }}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <div className="availability-calendar-footer">
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date();
                          setAvailabilityDate(toLocalDateInputValue(today));
                          setCalendarMonth(
                            new Date(today.getFullYear(), today.getMonth(), 1)
                          );
                          setIsCalendarOpen(false);
                        }}
                      >
                        {tr("Today", "आज")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCalendarOpen(false)}
                      >
                        {tr("Close", "बंद करा")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <p>{headerDescription}</p>
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
            {booking
              ? tr(
                  "Back to Booking Form",
                  "बुकिंग फॉर्मवर परत जा"
                )
              : tr(
                  "Back to Dashboard",
                  "डॅशबोर्डवर परत जा"
                )}
          </button>
        </div>
      </header>

      {roomError && (
        <div className="availability-error">
          {roomError}
        </div>
      )}

      {capacityError && (
        <div className="availability-error" role="alert">
          {tr(
            "Room capacity settings could not be loaded. Please refresh or contact Admin.",
            "खोलीची क्षमता लोड करता आली नाही. कृपया रीफ्रेश करा किंवा प्रशासकाशी संपर्क साधा."
          )}
        </div>
      )}

      {booking?.id && (
        <section className="booking-card">
          <h2>{tr("Private booking documents", "खाजगी बुकिंग दस्तऐवज")}</h2>
          {documentsError && <p role="alert">{documentsError}</p>}
          {bookingDocuments.length === 0 ? (
            <p>{tr("No documents have been uploaded.", "कोणतेही दस्तऐवज अपलोड केलेले नाहीत.")}</p>
          ) : (
            <ul>
              {bookingDocuments.map((item) => (
                <li key={item.id}>
                  {item.person_name} · {item.content_type}{" "}
                  <button
                    type="button"
                    onClick={() => void downloadBookingDocument(item.id)}
                  >
                    {tr("Download", "डाउनलोड")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {booking &&
        !authoritySelection &&
        unavailableRoom &&
        isWholeRoom(unavailableRoom) && (
          <section
            className="availability-toolbar"
            style={{
              border: "2px solid #c78a00",
              background:
                "rgba(199, 138, 0, 0.08)",
              marginBottom: "16px",
              alignItems: "center",
            }}
          >
            <div style={{ flex: 1 }}>
              <strong>
                {tr(
                  "CHANGE ROOM",
                  "खोली बदला"
                )}
              </strong>

              <p>
                {tr(
                  `${unavailableRoom.name} is not available for these dates. Select another available ${getRoomGroup(
                    unavailableRoom
                  )} room.`,
                  `${unavailableRoom.name} या तारखांसाठी उपलब्ध नाही. दुसरी उपलब्ध ${getRoomGroup(
                    unavailableRoom
                  )} खोली निवडा.`
                )}
              </p>
            </div>

            <div style={{ minWidth: "320px" }}>
              <label
                htmlFor="replacement-room"
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: "6px",
                }}
              >
                {tr(
                  "Available replacement room",
                  "उपलब्ध पर्यायी खोली"
                )}
              </label>

              <select
                id="replacement-room"
                value=""
                onChange={(event) => {
                  const replacement =
                    databaseRooms.find(
                      (room) =>
                        room.id ===
                        event.target.value
                    );

                  if (replacement) {
                    handleRoomSelection(
                      replacement
                    );
                  }
                }}
                disabled={
                  replacementRooms.length ===
                  0
                }
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  border:
                    "1px solid #c9ced8",
                  background: "#fff",
                  fontSize: "14px",
                }}
              >
                <option value="">
                  {replacementRooms.length >
                  0
                    ? tr(
                        "Select another room",
                        "दुसरी खोली निवडा"
                      )
                    : tr(
                        `No available ${getRoomGroup(
                          unavailableRoom
                        )} rooms`,
                        `कोणत्याही ${getRoomGroup(
                          unavailableRoom
                        )} खोल्या उपलब्ध नाहीत`
                      )}
                </option>

                {replacementRooms.map(
                  (room) => {
                    return (
                      <option
                        key={room.id}
                        value={room.id}
                      >
                        {room.name} — {tr("Available", "उपलब्ध")}
                      </option>
                    );
                  }
                )}
              </select>
            </div>
          </section>
        )}

      {authoritySelection && (
        <section
          className="availability-toolbar"
          style={{
            border: "2px solid #b8860b",
            background:
              "rgba(184, 134, 11, 0.08)",
            marginBottom: "16px",
          }}
        >
          <div>
            <strong>
              {tr(
                "EXPLICIT ROOM",
                "अधिकृत खोली"
              )}
            </strong>

            <p>
              {authoritySelection.roomNumber}
            </p>
          </div>

          <div>
            <strong>
              {tr(
                "AUTHORITY",
                "अधिकारी"
              )}
            </strong>

            <p>
              {authoritySelection.authorityRole}
            </p>
          </div>

          <div>
            <strong>
              {tr(
                "ALLOCATION",
                "वाटप"
              )}
            </strong>

            <p>
              {authoritySelection.isMatrixRoom
                ? `${tr(
                    "BED",
                    "बेड"
                  )} ${authoritySelection.bedNumber}`
                : tr(
                    "ROOM",
                    "खोली"
                  )}
            </p>
          </div>

          <div>
            <strong>
              {tr(
                "APPROVAL",
                "मंजुरी"
              )}
            </strong>

            <p>
              {tr(
                "Responsible Authority",
                "जबाबदार अधिकारी"
              )}
            </p>
          </div>
        </section>
      )}

      <section className="availability-toolbar availability-summary-toolbar">
        <div>
          <strong>
            {tr("Serviceman", "सैनिक")}
          </strong>

          <p>
            {booking?.serviceman.name ??
              tr(
                "No booking selected",
                "बुकिंग निवडलेली नाही"
              )}

            {booking && " • "}

            {booking?.serviceman.rank ?? ""}
          </p>
        </div>

        <div>
          <strong>
            {tr("Guests", "अतिथी")}
          </strong>

          <p>
            {booking
              ? booking.guests.length
              : "—"}
          </p>
        </div>

        <div>
          <strong>
            {booking || authoritySelection
              ? tr("Stay", "मुक्काम")
              : tr("Availability date", "उपलब्धतेची तारीख")}
          </strong>

          <p>
            {booking
              ? `${booking.checkIn ?? "—"} → ${booking.checkOut ?? "—"}`
              : authoritySelection
                ? "—"
                : formatAvailabilityDate(availabilityDate, language)}
          </p>
        </div>

        <div>
          <strong>
            {tr("Available", "उपलब्ध")}
          </strong>

          <p>
            {availableWholeRooms} {tr("whole rooms available", "पूर्ण खोल्या उपलब्ध")}
          </p>
        </div>
      </section>

      <section className="availability-legend">
        <div>
          <span className="legend-dot available" />
          {tr("Available", "उपलब्ध")}
        </div>

        <div>
          <span className="legend-dot reserved" />
          {tr("Reserved", "आरक्षित")}
        </div>

        <div>
          <span className="legend-dot occupied" />
          {tr(
            "Booked / Occupied",
            "बुक केलेले / व्यापलेले"
          )}
        </div>

        <div>
          <span className="legend-dot needs_cleaning" />
          {tr(
            "Needs Cleaning",
            "साफसफाई आवश्यक"
          )}
        </div>

        <div>
          <span className="legend-dot cleaning" />
          {tr(
            "Housekeeping / Cleaning",
            "हाऊसकीपिंग / साफसफाई"
          )}
        </div>

        <div>
          <span className="legend-dot out" />
          {tr(
            "Out of Service",
            "सेवेबाहेर"
          )}
        </div>
      </section>

      {isLoadingRooms ? (
        <section
          className="availability-empty-state"
          style={{
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <h2>
            {tr(
              "Loading room availability...",
              "खोली उपलब्धता लोड होत आहे..."
            )}
          </h2>

          <p>
            {tr(
              "Please wait while the current room and bed status is loaded.",
              "सध्याची खोली आणि बेड स्थिती लोड होईपर्यंत कृपया प्रतीक्षा करा."
            )}
          </p>
        </section>
      ) : databaseRooms.length === 0 ? (
        <section
          className="availability-empty-state"
          style={{
            padding: "60px 20px",
            textAlign: "center",
          }}
        >
          <h2>
            {tr(
              "No room data available",
              "खोलीची माहिती उपलब्ध नाही"
            )}
          </h2>

          <p>
            {role === "ADMIN"
              ? tr(
                  "Room availability is restricted to roles with room permissions. Room rates and payment configuration remain available above.",
                  "खोलीची उपलब्धता केवळ खोलीच्या परवानग्या असलेल्या भूमिकांसाठी आहे. खोलीचे दर आणि पेमेंट कॉन्फिगरेशन वर उपलब्ध आहे."
                )
              : tr(
                  "No rooms were returned by the backend for the current user.",
                  "सध्याच्या वापरकर्त्यासाठी बॅकएंडकडून कोणत्याही खोल्या मिळाल्या नाहीत."
                )}
          </p>
        </section>
      ) : (
        <>
          <div className="whole-room-category-grid">
            {wholeRoomSections.map(
              ({ group, rooms, description }) =>
                rooms.length > 0 && (
                  <section
                    className={`room-list room-category-box room-category-${group.toLowerCase()}`}
                    key={group}
                  >
                    <div className="availability-section-heading">
                      <div className="room-category-title">
                        <span className="section-label">
                          {tr("ROOM CATEGORY", "खोलीचा प्रकार")}
                        </span>
                        <h2>{group}</h2>
                      </div>
                      <span className="room-category-count">
                        {rooms.length}{" "}
                        {tr("rooms", "खोल्या")}
                      </span>
                      <p>{description}</p>
                    </div>

                    <div className="whole-room-grid">
                      {[...rooms]
                        .sort((a, b) => {
                          const numberDifference =
                            roomNumber(a) - roomNumber(b);

                          return numberDifference !== 0
                            ? numberDifference
                            : a.name.localeCompare(
                                b.name,
                                undefined,
                                {
                                  numeric: true,
                                  sensitivity: "base",
                                }
                              );
                        })
                        .map(renderWholeRoomCard)}
                    </div>
                  </section>
                )
            )}
          </div>

          {/* =================================
              DM
          ================================== */}

          {visibleDmRooms.length > 0 && (
            <section className="room-list">
              <div className="availability-section-heading">
                <span className="section-label">
                  {tr(
                    "DORMITORY",
                    "वसतिगृह"
                  )}
                </span>

                <h2>DM</h2>

                <p>
                  {booking
                    ? tr(
                        "Select the exact bed for each guest.",
                        "प्रत्येक अतिथीसाठी अचूक बेड निवडा."
                      )
                    : tr(
                        "Current individual bed status.",
                        "सध्याची प्रत्येक बेडची स्थिती."
                      )}
                </p>
              </div>

              {visibleDmRooms
                .sort(
                  (a, b) =>
                    roomNumber(a) -
                    roomNumber(b)
                )
                .map(renderBedRoom)}
            </section>
          )}

          {/* =================================
              HALL
          ================================== */}

          {visibleHallRooms.length > 0 && (
            <section className="room-list">
              <div className="availability-section-heading">
                <span className="section-label">
                  HALL
                </span>

                <h2>HALL</h2>

                <p>
                  {booking
                    ? tr(
                        "Select the exact seat / bed for each guest.",
                        "प्रत्येक अतिथीसाठी अचूक जागा / बेड निवडा."
                      )
                    : tr(
                        "Current individual seat / bed status.",
                        "सध्याची प्रत्येक जागा / बेडची स्थिती."
                      )}
                </p>
              </div>

              {visibleHallRooms.map(
                renderBedRoom
              )}
            </section>
          )}
        </>
      )}

      {/* =================================
          ASSIGN OCCUPANTS
      ================================== */}

      {booking &&
        selectionMode === "BED" &&
        selectedBeds.length > 0 && (
          <section className="booking-card">
            <div className="booking-section-title">
              <span>05</span>

              <div>
                <h2>
                  {tr(
                    "Assign Occupants",
                    "रहिवासी नियुक्त करा"
                  )}
                </h2>

                <p>
                  {tr(
                    "Assign each guest to the selected bed or seat.",
                    "निवडलेल्या बेड किंवा जागेवर प्रत्येक अतिथी नियुक्त करा."
                  )}
                </p>
              </div>
            </div>

            <div className="booking-grid">
              {selectedBeds.map((bed) => (
                <div
                  className="form-field"
                  key={bed.bedId}
                >
                  <label>
                    {bed.roomName}
                    {" — "}
                    {tr("Bed", "बेड")}{" "}
                    {bed.bedNumber}
                  </label>

                  <select
                    value={bed.guestId}
                    onChange={(e) =>
                      assignGuest(
                        bed.bedId,
                        e.target.value
                      )
                    }
                  >
                    <option value="">
                      {tr(
                        "Select occupant",
                        "रहिवासी निवडा"
                      )}
                    </option>

                    {booking.guests
                      .filter((guest) => {
                        const room = databaseRooms.find(
                          (item) => item.id === bed.roomId
                        );
                        return !room ||
                          isGuestAllowedByRoomGender(room, guest.gender);
                      })
                      .map(
                      (guest, index) => (
                        <option
                          key={
                            guest.id ||
                            index
                          }
                          value={
                            guest.id || ""
                          }
                        >
                          {guest.name}
                        </option>
                      )
                      )}
                  </select>
                </div>
              ))}
            </div>
          </section>
        )}

      {/* =================================
          ROOM SELECTED
      ================================== */}

      {booking &&
        selectionMode === "ROOM" &&
        selectedWholeRoom && (
          <section className="booking-card">
            <div className="booking-section-title">
              <span>05</span>

              <div>
                <h2>
                  {tr(
                    "Room Selected",
                    "खोली निवडली"
                  )}
                </h2>

                <p>
                  {tr(
                    "The complete room will be allotted to this booking.",
                    "या बुकिंगसाठी संपूर्ण खोली दिली जाईल."
                  )}
                </p>
              </div>
            </div>

            <div className="room-selection-summary">
              <strong>
                {selectedWholeRoom.name}
              </strong>

              <p>
                {requiredGuests}{" "}
                {tr(
                  "guest(s)",
                  "अतिथी"
                )}
              </p>

              {authoritySelection && (
                <p>
                  <strong>
                    {tr(
                      "Approval Authority:",
                      "मंजुरी अधिकारी:"
                    )}
                  </strong>{" "}
                  {
                    authoritySelection.authorityRole
                  }
                </p>
              )}
            </div>
          </section>
        )}

      {/* =================================
          SELECTION BAR
      ================================== */}

      {booking && (
        <section className="selection-bar">
          <div>
            <span>
              {selectionMode === "BED"
                ? tr(
                    "Dormitory / Hall Bed Selection",
                    "वसतिगृह / हॉल बेड निवड"
                  )
                : tr(
                    "Room Selection",
                    "खोली निवड"
                  )}
            </span>

            <strong>
              {selectionMode === "BED"
                ? `${selectedMatrixBeds.length} / ${requiredGuests} ${tr(
                    "BED(S) SELECTED",
                    "बेड निवडले"
                  )}`
                : selectionMode === "ROOM"
                ? tr(
                    "1 / 1 ROOM SELECTED",
                    "1 / 1 खोली निवडली"
                  )
                : tr(
                    "SELECT A ROOM OR BED",
                    "खोली किंवा बेड निवडा"
                  )}
            </strong>
          </div>

          <div>
            {selectedBeds.length > 0 &&
              !authoritySelection && (
                <button
                  type="button"
                  className="secondary-action"
                  onClick={
                    clearSelection
                  }
                >
                  {tr(
                    "CLEAR",
                    "साफ करा"
                  )}
                </button>
              )}

            <button
              type="button"
              className="continue-booking-button"
              disabled={
                selectionMode === "ROOM"
                  ? selectedBeds.length !==
                    requiredGuests
                  : selectionMode === "BED"
                  ? selectedMatrixBeds.length !==
                    requiredGuests
                  : true
              }
              onClick={handleConfirm}
            >
              {authoritySelection
                ? tr(
                    "CONFIRM EXPLICIT ALLOTMENT →",
                    "अधिकृत वाटप निश्चित करा →"
                  )
                : selectionMode === "BED"
                ? tr(
                    "CONFIRM BED / SEAT ALLOTMENT →",
                    "बेड / जागा वाटप निश्चित करा →"
                  )
                : tr(
                    "CONFIRM ROOM ALLOTMENT →",
                    "खोली वाटप निश्चित करा →"
                  )}
            </button>
          </div>
        </section>
      )}

      {detailsRoomId &&
        (() => {
          const room = databaseRooms.find(
            (item) => item.id === detailsRoomId
          );

          if (!room) {
            return null;
          }

          const status = getRoomStatus(room);
          const assignments =
            room.assignments || [];
          const isStore =
            room.currentStatus === "STORE";

          return (
            <div
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setDetailsRoomId(null);
                }
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2000,
                display: "grid",
                placeItems: "center",
                padding: 20,
                background: "rgba(15, 23, 42, 0.58)",
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="room-details-title"
                style={{
                  width: "min(620px, 100%)",
                  maxHeight: "85vh",
                  overflowY: "auto",
                  borderRadius: 18,
                  padding: 26,
                  background: "#fff",
                  boxShadow: "0 24px 80px rgba(0,0,0,.28)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 16,
                  }}
                >
                  <div>
                    <span className="section-label">
                      {tr("ROOM DETAILS", "खोलीचे तपशील")}
                    </span>
                    <h2 id="room-details-title">
                      {room.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDetailsRoomId(null)
                    }
                    aria-label={tr("Close", "बंद करा")}
                    style={{
                      border: 0,
                      borderRadius: 8,
                      padding: "8px 12px",
                      background: "#eef2ef",
                      cursor: "pointer",
                    }}
                  >
                    {tr("Close", "बंद करा")}
                  </button>
                </div>

                <dl
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(2, minmax(0, 1fr))",
                    gap: "14px 24px",
                  }}
                >
                  <div>
                    <dt>{tr("Category", "वर्ग")}</dt>
                    <dd>{room.category || tr("Unknown", "अज्ञात")}</dd>
                  </div>
                  <div>
                    <dt>{tr("Room type", "खोलीचा प्रकार")}</dt>
                    <dd>
                      {isStore
                        ? tr("Store Room", "साठवण खोली")
                        : isVipRoom(room)
                        ? tr("VIP AC Room", "व्हीआयपी वातानुकूलित खोली")
                        : isAcRoom(room)
                        ? tr("AC Room", "वातानुकूलित खोली")
                        : isNacRoom(room)
                        ? tr("Non-AC Room", "विनावातानुकूलन खोली")
                        : isDmRoom(room)
                        ? tr("Dormitory", "वसतिगृह")
                        : isHallRoom(room)
                        ? tr("Hall", "हॉल")
                        : tr("Accommodation", "निवास")}
                    </dd>
                  </div>
                  <div>
                    <dt>{tr("Current status", "सध्याची स्थिती")}</dt>
                    <dd>{status.label}</dd>
                  </div>
                </dl>

                <hr />
                <h3>{tr("ASSIGNMENT DETAILS", "वाटप तपशील")}</h3>

                {isStore ? (
                  <p>{tr("Store Room", "साठवण खोली")}</p>
                ) : assignments.length === 0 ? (
                  <p>{tr("No current guest assigned", "सध्या कोणताही अतिथी नियुक्त नाही")}</p>
                ) : (
                  assignments.map((assignment) => (
                    <article
                      key={assignment.allotment_id}
                      style={{
                        marginTop: 12,
                        padding: 16,
                        borderRadius: 12,
                        background: "#f7f8f6",
                      }}
                    >
                      <p>
                        <strong>{tr("Guest", "अतिथी")}:</strong>{" "}
                        {assignment.guest_name || tr("Not recorded", "नोंद नाही")}
                      </p>
                      {assignment.mobile_number && (
                        <p>
                          <strong>{tr("Mobile", "मोबाईल")}:</strong>{" "}
                          {assignment.mobile_number}
                        </p>
                      )}
                      <p>
                        <strong>{tr("Booking", "बुकिंग")}:</strong>{" "}
                        {assignment.booking_reference}
                      </p>
                      <p>
                        <strong>{tr("Allotment status", "वाटप स्थिती")}:</strong>{" "}
                        {assignment.allotment_status}
                      </p>
                      <p>
                        <strong>{tr("Check-in status", "प्रवेश स्थिती")}:</strong>{" "}
                        {assignment.check_in_status}
                      </p>
                      {assignment.check_in_time && (
                        <p>
                          <strong>{tr("Checked in", "प्रवेश वेळ")}:</strong>{" "}
                          {new Date(assignment.check_in_time).toLocaleString()}
                        </p>
                      )}
                      <p>
                        <strong>{tr("Expected checkout", "अपेक्षित निर्गमन")}:</strong>{" "}
                        {assignment.expected_check_out_date}
                      </p>
                    </article>
                  ))
                )}
              </section>
            </div>
          );
        })()}
    </main>
  );
}

export default Availability;