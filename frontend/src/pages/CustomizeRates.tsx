import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useLanguage } from "../i18n/LanguageContext";
import "../App.css";

interface RoomRateCard {
  id: string;
  room_number: string;
  category_name: string;
  total_beds: number;
  is_bookable: boolean;
  gender_restriction: GenderRestriction;
  room_note: string | null;
  room_capacity: number | string | null;
  bed_capacity: number | string | null;
  esm_room_rate: number | string | null;
  serving_room_rate: number | string | null;
  civilian_room_rate: number | string | null;
  is_under_maintenance: boolean;
}

type DelayedCheckoutRateCategory = "AC" | "NAC" | "DM_BED" | "VIP";

type DelayedCheckoutRateDraft = Record<DelayedCheckoutRateCategory, string>;

const delayedCheckoutRateCategories: Array<{
  key: DelayedCheckoutRateCategory;
  title: string;
  titleMr: string;
  appliesTo: string;
  appliesToMr: string;
}> = [
  {
    key: "AC",
    title: "AC",
    titleMr: "AC",
    appliesTo: "All AC rooms",
    appliesToMr: "सर्व AC खोल्या",
  },
  {
    key: "NAC",
    title: "NAC",
    titleMr: "NAC",
    appliesTo: "All NAC rooms",
    appliesToMr: "सर्व NAC खोल्या",
  },
  {
    key: "DM_BED",
    title: "DM / Hall beds",
    titleMr: "DM / Hall बेड",
    appliesTo: "Every bed in all DM rooms and Halls",
    appliesToMr: "सर्व DM खोल्या आणि Hall मधील प्रत्येक बेड",
  },
  {
    key: "VIP",
    title: "VIP",
    titleMr: "VIP",
    appliesTo: "All VIP rooms",
    appliesToMr: "सर्व VIP खोल्या",
  },
];

type EditableRateField =
  | "room_capacity"
  | "bed_capacity"
  | "esm_room_rate"
  | "serving_room_rate"
  | "civilian_room_rate";

type GenderRestriction = "ANY" | "MALE" | "FEMALE";

type RoomGroup = "AC" | "NAC" | "DM" | "HALL" | "VIP" | "OTHER";

const roomCategoryOptions = [
  "AC",
  "NAC",
  "DM",
  "HALL",
  "VIP",
  "OTHER",
] as const;

interface CustomizeRatesProps {
  onBack: () => void;
}

const categoryOrder: RoomGroup[] = ["AC", "NAC", "DM", "HALL", "VIP", "OTHER"];

const fields: {
  key: EditableRateField;
  label: string;
  min: string;
  step: string;
}[] = [
  { key: "room_capacity", label: "Room capacity", min: "1", step: "1" },
  { key: "bed_capacity", label: "Bed capacity", min: "0", step: "1" },
  {
    key: "esm_room_rate",
    label: "ESM rate",
    min: "0.01",
    step: "0.01",
  },
  {
    key: "serving_room_rate",
    label: "Serving rate",
    min: "0.01",
    step: "0.01",
  },
  {
    key: "civilian_room_rate",
    label: "Civilian rate",
    min: "0.01",
    step: "0.01",
  },
];

const dmRateFields = fields.filter(
  (
    field
  ): field is (typeof fields)[number] & {
    key: "esm_room_rate" | "serving_room_rate" | "civilian_room_rate";
  } =>
    field.key === "esm_room_rate" ||
    field.key === "serving_room_rate" ||
    field.key === "civilian_room_rate"
);

const getRoomGroup = (room: RoomRateCard): RoomGroup => {
  const category = room.category_name.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const number = room.room_number.trim().toUpperCase();
  if (category === "VIP" || category.includes("VIP")) {
    return "VIP";
  }
  if (
    category === "DORMITORY" ||
    category === "DM" ||
    category.includes("DORMITORY")
  ) {
    return "DM";
  }
  if (category === "HALL") return "HALL";
  if (
    category === "NAC" ||
    category === "NON_AC" ||
    category.includes("NON_AC")
  ) {
    return "NAC";
  }
  if (category === "AC" || category.startsWith("AC_")) {
    return "AC";
  }
  if (number.startsWith("VIP")) return "VIP";
  if (number.startsWith("DM")) return "DM";
  if (number.startsWith("HALL")) return "HALL";
  if (number.startsWith("NAC")) return "NAC";
  if (number.startsWith("AC")) return "AC";
  return "OTHER";
};

const sameOptionalRate = (
  rooms: RoomRateCard[],
  field: "esm_room_rate" | "serving_room_rate" | "civilian_room_rate"
): boolean => {
  if (rooms.length < 2) return true;
  const first = rooms[0][field];
  return rooms.every((room) => String(room[field] ?? "") === String(first ?? ""));
};

function CustomizeRates({ onBack }: CustomizeRatesProps) {
  const { language } = useLanguage();
  const isMarathi = language === "mr";
  const tr = (english: string, marathi: string) =>
    isMarathi ? marathi : english;

  const [rooms, setRooms] = useState<RoomRateCard[]>([]);
  const [delayedCheckoutRates, setDelayedCheckoutRates] =
    useState<DelayedCheckoutRateDraft>({
      AC: "0",
      NAC: "0",
      DM_BED: "0",
      VIP: "0",
    });
  const [identityDrafts, setIdentityDrafts] = useState<
    Record<string, { room_number: string; category: "AC" | "NAC" | "DM" }>
  >({});
  const [dmRates, setDmRates] = useState({
    esm_room_rate: "",
    serving_room_rate: "",
    civilian_room_rate: "",
  });
  const [dmRatesDiffer, setDmRatesDiffer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadRates = async () => {
      try {
        const [response, delayedRatesResponse] = await Promise.all([
          apiFetch("http://localhost:5000/api/rooms/rate-card"),
          apiFetch("http://localhost:5000/api/rooms/delayed-checkout-rates"),
        ]);
        const [data, delayedRatesData] = await Promise.all([
          response.json(),
          delayedRatesResponse.json(),
        ]);
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to load room rates.");
        }
        if (
          !delayedRatesResponse.ok ||
          !delayedRatesData.success ||
          typeof delayedRatesData.rates !== "object" ||
          delayedRatesData.rates === null
        ) {
          throw new Error(
            delayedRatesData.message ||
              "Unable to load delayed check-out rates."
          );
        }
        if (!cancelled) {
          const loadedRooms: RoomRateCard[] = Array.isArray(data.rooms)
            ? data.rooms
            : [];
          setDelayedCheckoutRates(
            Object.fromEntries(
              delayedCheckoutRateCategories.map(({ key }) => [
                key,
                String(delayedRatesData.rates[key] ?? 0),
              ])
            ) as DelayedCheckoutRateDraft
          );
          setRooms(
            loadedRooms.sort((a, b) =>
              a.room_number.localeCompare(b.room_number, undefined, {
                numeric: true,
                sensitivity: "base",
              })
            )
          );
          const dmRooms = loadedRooms.filter(
            (room) => getRoomGroup(room) === "DM" && room.is_bookable
          );
          const ratesAreConsistent =
            sameOptionalRate(dmRooms, "esm_room_rate") &&
            sameOptionalRate(dmRooms, "serving_room_rate") &&
            sameOptionalRate(dmRooms, "civilian_room_rate");
          setDmRatesDiffer(!ratesAreConsistent);
          setDmRates({
            esm_room_rate: ratesAreConsistent
              ? String(dmRooms[0]?.esm_room_rate ?? "")
              : "",
            serving_room_rate: ratesAreConsistent
              ? String(dmRooms[0]?.serving_room_rate ?? "")
              : "",
            civilian_room_rate: ratesAreConsistent
              ? String(dmRooms[0]?.civilian_room_rate ?? "")
              : "",
          });
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load room rates."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRates();
    return () => {
      cancelled = true;
    };
  }, []);

  const groupedRooms = categoryOrder
    .map((group) => ({
      group,
      rooms: rooms.filter((room) => getRoomGroup(room) === group),
    }))
    .filter(({ rooms: groupRooms }) => groupRooms.length > 0);

  const updateRoom = (
    roomId: string,
    field: EditableRateField,
    value: string
  ) => {
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? { ...room, [field]: value === "" ? null : value }
          : room
      )
    );
    setMessage("");
  };

  const updateRoomField = (
    roomId: string,
    field: "room_number" | "category_name",
    value: string
  ) => {
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? { ...room, [field]: value }
          : room
      )
    );
    setMessage("");
  };

  const saveRoom = async (room: RoomRateCard) => {
    const key = `room:${room.id}`;
    setSavingKey(key);
    setMessage("");
    setError("");
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/rooms/${room.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_number: room.room_number,
            category_name: room.category_name,
            room_capacity: room.room_capacity,
            bed_capacity: room.bed_capacity,
            esm_room_rate: room.esm_room_rate,
            serving_room_rate: room.serving_room_rate,
            civilian_room_rate: room.civilian_room_rate,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save this room's settings.");
      }
      setRooms((current) =>
        current.map((currentRoom) =>
          currentRoom.id === room.id
            ? {
                ...currentRoom,
                room_number: room.room_number,
                category_name: room.category_name,
                room_capacity: room.room_capacity,
                bed_capacity: room.bed_capacity,
                esm_room_rate: room.esm_room_rate,
                serving_room_rate: room.serving_room_rate,
                civilian_room_rate: room.civilian_room_rate,
              }
            : currentRoom
        )
      );
      setMessage(
        tr(
          `Saved settings for ${room.room_number}.`,
          `${room.room_number} साठी सेटिंग्ज जतन केल्या.`
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save room settings."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const saveDelayedCheckoutRates = async () => {
    const draft = delayedCheckoutRates;
    if (
      delayedCheckoutRateCategories.some(({ key }) =>
        !draft[key].trim() ||
        !Number.isFinite(Number(draft[key])) ||
        Number(draft[key]) < 0
      )
    ) {
      setError(
        tr(
          "Enter a valid non-negative rate for every category.",
          "प्रत्येक प्रकारासाठी शून्य किंवा त्यापेक्षा जास्त योग्य दर भरा."
        )
      );
      return;
    }

    const key = "delayed-checkout-rates";
    setSavingKey(key);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(
        "http://localhost:5000/api/rooms/delayed-checkout-rates",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rates: Object.fromEntries(
              delayedCheckoutRateCategories.map(({ key: category }) => [
                category,
                Number(draft[category]),
              ])
            ),
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to save delayed check-out rates."
        );
      }
      setMessage(
        tr(
          "Saved shared delayed check-out rates.",
          "सामायिक उशिरा चेक-आउटचे दर जतन केले."
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save delayed check-out rates."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const getIdentityDraft = (room: RoomRateCard) =>
    identityDrafts[room.id] ?? {
      room_number: room.room_number,
      category:
        getRoomGroup(room) === "NAC"
          ? "NAC"
          : getRoomGroup(room) === "DM"
            ? "DM"
            : "AC",
    };

  const updateRoomIdentity = (
    room: RoomRateCard,
    field: "room_number" | "category",
    value: string
  ) => {
    const currentDraft = getIdentityDraft(room);
    setIdentityDrafts((current) => ({
      ...current,
      [room.id]: {
        ...currentDraft,
        [field]: value,
      },
    }));
    setMessage("");
  };

  const saveRoomIdentity = async (room: RoomRateCard) => {
    const key = `identity:${room.id}`;
    setSavingKey(key);
    setMessage("");
    setError("");
    try {
      const identity = getIdentityDraft(room);
      const response = await apiFetch(
        `http://localhost:5000/api/rooms/${room.id}/identity`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_number: identity.room_number,
            category:
              identity.category === "AC"
                ? "AC"
                : identity.category === "NAC"
                  ? "NON_AC"
                  : "DORMITORY",
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update this room.");
      }
      setRooms((current) =>
        current.map((currentRoom) =>
          currentRoom.id === room.id
            ? {
                ...currentRoom,
                room_number: data.room.room_number,
                category_name: data.room.category_name,
                gender_restriction:
                  identity.category === "DM"
                    ? currentRoom.gender_restriction
                    : "ANY",
              }
            : currentRoom
        )
      );
      setIdentityDrafts((current) => {
        const next = { ...current };
        delete next[room.id];
        return next;
      });
      setMessage(
        tr(
          `Updated ${data.room.room_number} room category and number.`,
          `${data.room.room_number} खोलीचा प्रकार आणि क्रमांक बदलला.`
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update room category or number."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const renderRoomIdentityEditor = (room: RoomRateCard) => {
    const draft = getIdentityDraft(room);
    return (
      <div className="customize-room-identity">
        <label>
          <span>{tr("Room number", "खोली क्रमांक")}</span>
          <input
            aria-label={`${room.room_number} room number`}
            type="text"
            maxLength={50}
            value={draft.room_number}
            onChange={(event) =>
              updateRoomIdentity(room, "room_number", event.target.value)
            }
          />
        </label>
        <label>
          <span>{tr("Room category", "खोलीचा प्रकार")}</span>
          <select
            aria-label={`${room.room_number} room category`}
            value={draft.category}
            onChange={(event) =>
              updateRoomIdentity(
                room,
                "category",
                event.target.value as "AC" | "NAC" | "DM"
              )
            }
          >
            <option value="AC">AC</option>
            <option value="NAC">NAC</option>
            <option value="DM">DM / Dormitory</option>
          </select>
        </label>
        <button
          type="button"
          className="customize-room-identity-save"
          onClick={() => void saveRoomIdentity(room)}
          disabled={savingKey !== null}
        >
          {savingKey === `identity:${room.id}`
            ? tr("Saving…", "जतन होत आहे...")
            : tr("Save room type / number", "प्रकार / क्रमांक जतन करा")}
        </button>
        {getRoomGroup(room) === "DM" && (
          <div className="customize-room-gender-restriction">
            <label>
              <span>{tr("Gender restriction", "लिंग मर्यादा")}</span>
              <select
                aria-label={`${room.room_number} gender restriction`}
                value={room.gender_restriction}
                onChange={(event) =>
                  setRooms((current) =>
                    current.map((currentRoom) =>
                      currentRoom.id === room.id
                        ? {
                            ...currentRoom,
                            gender_restriction:
                              event.target.value as GenderRestriction,
                          }
                        : currentRoom
                    )
                  )
                }
              >
                <option value="ANY">{tr("Any gender", "सर्व लिंग")}</option>
                <option value="MALE">{tr("Male only", "फक्त पुरुष")}</option>
                <option value="FEMALE">{tr("Female only", "फक्त महिला")}</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void saveGenderRestriction(room)}
              disabled={savingKey !== null}
            >
              {savingKey === `gender:${room.id}`
                ? tr("Saving…", "जतन होत आहे...")
                : tr("Save restriction", "मर्यादा जतन करा")}
            </button>
          </div>
        )}
      </div>
    );
  };

  const saveGenderRestriction = async (room: RoomRateCard) => {
    const key = `gender:${room.id}`;
    setSavingKey(key);
    setMessage("");
    setError("");
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/rooms/${room.id}/gender-restriction`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gender_restriction: room.gender_restriction,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to update the room gender restriction."
        );
      }
      setRooms((current) =>
        current.map((currentRoom) =>
          currentRoom.id === room.id
            ? {
                ...currentRoom,
                gender_restriction: data.room.gender_restriction,
              }
            : currentRoom
        )
      );
      setMessage(
        tr(
          `Saved gender restriction for ${room.room_number}.`,
          `${room.room_number} साठी लिंग मर्यादा जतन केली.`
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the room gender restriction."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const toggleMaintenance = async (room: RoomRateCard) => {
    const nextState = !room.is_under_maintenance;
    const key = `maintenance:${room.id}`;
    setSavingKey(key);
    setMessage("");
    setError("");

    try {
      const response = await apiFetch(
        `http://localhost:5000/api/rooms/${room.id}/maintenance`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_under_maintenance: nextState }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update maintenance status.");
      }

      setRooms((current) =>
        current.map((currentRoom) =>
          currentRoom.id === room.id
            ? { ...currentRoom, is_under_maintenance: nextState }
            : currentRoom
        )
      );
      setMessage(
        nextState
          ? tr(
              `${room.room_number} is unavailable for maintenance.`,
              `${room.room_number} देखभालीसाठी अनुपलब्ध केली आहे.`
            )
          : tr(
              `${room.room_number} is available for booking again.`,
              `${room.room_number} पुन्हा बुकिंगसाठी उपलब्ध आहे.`
            )
      );
    } catch (maintenanceError) {
      setError(
        maintenanceError instanceof Error
          ? maintenanceError.message
          : "Unable to update maintenance status."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const renderMaintenanceControl = (room: RoomRateCard) => (
    <div className="customize-rate-card-footer">
      <span>
        {room.is_under_maintenance
          ? tr("Under maintenance", "देखभाल सुरू")
          : tr("Available for booking", "बुकिंगसाठी उपलब्ध")}
      </span>
      <button
        type="button"
        className={room.is_under_maintenance ? "secondary-action" : undefined}
        onClick={() => void toggleMaintenance(room)}
        disabled={savingKey !== null}
      >
        {savingKey === `maintenance:${room.id}`
          ? tr("Saving…", "जतन होत आहे...")
          : room.is_under_maintenance
            ? tr("End maintenance", "देखभाल पूर्ण")
            : tr("Mark maintenance", "देखभाल सुरू करा")}
      </button>
    </div>
  );

  const renderRoomInventoryBadges = (room: RoomRateCard) => (
    <div className="customize-room-inventory-badges">
      {room.room_note && <span>{room.room_note}</span>}
      {!room.is_bookable && (
        <span>{tr("Not bookable", "बुकिंगसाठी नाही")}</span>
      )}
      {room.gender_restriction === "MALE" && (
        <span>{tr("Male guests only", "फक्त पुरुष")}</span>
      )}
      {room.gender_restriction === "FEMALE" && (
        <span>{tr("Female guests only", "फक्त महिला")}</span>
      )}
    </div>
  );

  const saveDmRates = async () => {
    setSavingKey("dm-rates");
    setMessage("");
    setError("");
    try {
      const response = await apiFetch(
        "http://localhost:5000/api/rooms/rate-card/category/dormitory",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dmRates),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to save shared DM rates.");
      }
      setRooms((current) =>
        current.map((room) =>
          getRoomGroup(room) === "DM" && room.is_bookable
            ? {
                ...room,
                esm_room_rate:
                  dmRates.esm_room_rate || null,
                serving_room_rate:
                  dmRates.serving_room_rate || null,
                civilian_room_rate: dmRates.civilian_room_rate || null,
              }
            : room
        )
      );
      setDmRatesDiffer(false);
      setMessage(
        tr(
          `Shared rates saved for ${data.updatedRooms} DM rooms.`,
          `${data.updatedRooms} DM खोल्यांसाठी समान दर जतन केले.`
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save shared DM rates."
      );
    } finally {
      setSavingKey(null);
    }
  };

  const renderRoomFields = (room: RoomRateCard) => (
    <div className="customize-rate-fields">
      <label className="customize-rate-field">
        <span>{tr("Room number", "खोली क्रमांक")}</span>
        <span className="customize-rate-input-wrap">
          <input
            aria-label={`${room.room_number} room number`}
            type="text"
            value={room.room_number}
            onChange={(event) =>
              updateRoomField(room.id, "room_number", event.target.value)
            }
          />
        </span>
      </label>

      <label className="customize-rate-field">
        <span>{tr("Room type", "खोलीचा प्रकार")}</span>
        <span className="customize-rate-input-wrap">
          <select
            aria-label={`${room.room_number} room type`}
            value={room.category_name || "AC"}
            onChange={(event) =>
              updateRoomField(room.id, "category_name", event.target.value)
            }
          >
            {roomCategoryOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </span>
      </label>

      {fields.map((field) => (
        <label className="customize-rate-field" key={field.key}>
          <span>{tr(field.label, field.label)}</span>
          <span className="customize-rate-input-wrap">
            {field.key.endsWith("_rate") && <span>₹</span>}
            <input
              aria-label={`${room.room_number} ${field.label}`}
              type="number"
              min={field.min}
              step={field.step}
              value={room[field.key] ?? ""}
              onChange={(event) =>
                updateRoom(room.id, field.key, event.target.value)
              }
            />
          </span>
        </label>
      ))}
    </div>
  );

  return (
    <main className="customize-rates-screen">
      <header className="customize-rates-header">
        <button
          type="button"
          className="customize-rates-back"
          onClick={onBack}
        >
          ← {tr("Dashboard", "डॅशबोर्ड")}
        </button>
        <div className="customize-rates-title-row">
          <div className="customize-rates-mark" aria-hidden="true">₹</div>
          <div>
            <span className="customize-rates-eyebrow">
              {tr("ADMINISTRATION", "प्रशासन")}
            </span>
            <h1>{tr("Customize Room and Rates", "खोली आणि दर सानुकूलित करा")}</h1>
            <p>
              {tr(
                "Manage approved rates and capacities. Beds are for availability tracking only and never have a separate charge.",
                "मंजूर दर आणि क्षमता व्यवस्थापित करा. बेड फक्त उपलब्धता तपासण्यासाठी आहेत; त्यांचे वेगळे शुल्क नाही."
              )}
            </p>
          </div>
        </div>
      </header>

      <section className="customize-rates-content">
        <div className="customize-rates-notice">
          <span aria-hidden="true">i</span>
          <p>
            {tr(
              "Only enter department-approved rates. Blank rates remain unconfigured and cannot be used for pricing.",
              "विभागाने मंजूर केलेले दरच प्रविष्ट करा. रिकामे दर किंमत ठरवण्यासाठी वापरता येणार नाहीत."
            )}
          </p>
        </div>

        {error && <p className="customize-rates-error" role="alert">{error}</p>}
        {message && <p className="customize-rates-success" role="status">{message}</p>}

        {loading ? (
          <div className="customize-rates-empty">
            {tr("Loading room rate cards…", "खोलीचे दर कार्ड लोड होत आहेत...")}
          </div>
        ) : rooms.length === 0 ? (
          <div className="customize-rates-empty">
            <strong>{tr("No active rooms found", "सक्रिय खोल्या सापडल्या नाहीत")}</strong>
          </div>
        ) : (
          <>
          <section className="customize-rate-category">
            <header className="customize-rate-category-heading">
              <div>
                <span>{tr("ADMIN CONFIGURATION", "प्रशासकीय सेटिंग")}</span>
                <h2>{tr("Delayed Check-Out Fine Rates", "उशिरा चेक-आउट दंडाचे दर")}</h2>
              </div>
              <small>{tr("One shared rate for each category · per started hour", "प्रत्येक प्रकारासाठी एक सामायिक दर · सुरू झालेल्या प्रत्येक तासासाठी")}</small>
            </header>
            <p className="customize-rates-notice">
              {tr(
                "No fine during the first 20 minutes after the scheduled checkout time. After that, every started hour is charged at the configured rate.",
                "अपेक्षित चेक-आउट वेळेनंतर पहिल्या 20 मिनिटांत दंड नाही. त्यानंतर सुरू झालेला प्रत्येक तास ठरवलेल्या दराने आकारला जाईल."
              )}
            </p>
            <div className="customize-rate-grid">
              {delayedCheckoutRateCategories.map((category) => (
                  <article className="customize-rate-card" key={category.key}>
                    <div className="customize-rate-card-heading">
                      <div className="customize-rate-room-mark" aria-hidden="true">
                        {category.key === "DM_BED" ? "DM" : category.title}
                      </div>
                      <div>
                        <span>{tr("SHARED DELAYED CHECK-OUT RATE", "सामायिक उशिरा चेक-आउट दर")}</span>
                        <h3>{isMarathi ? category.titleMr : category.title}</h3>
                      </div>
                    </div>
                    <div className="customize-rate-fields">
                      <label className="customize-rate-field">
                        <span>{tr("Fine per started hour (₹)", "सुरू झालेल्या प्रत्येक तासाचा दंड (₹)")}</span>
                        <span className="customize-rate-input-wrap">
                          <span>₹</span>
                          <input
                            aria-label={`${category.title} shared delayed checkout hourly rate`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={delayedCheckoutRates[category.key]}
                            onChange={(event) =>
                              setDelayedCheckoutRates((current) => ({
                                ...current,
                                [category.key]: event.target.value,
                              }))
                            }
                          />
                        </span>
                      </label>
                    </div>
                    <div className="customize-rate-card-footer">
                      <span>
                        {tr(category.appliesTo, category.appliesToMr)}
                        {" · "}
                        {tr("20-minute grace period", "20 मिनिटांचा grace period")}
                      </span>
                    </div>
                  </article>
                ))}
            </div>
            <div className="customize-rate-card-footer">
              <span>
                {tr(
                  "Each category rate applies to every room or bed listed on its card.",
                  "प्रत्येक प्रकारचा दर त्या कार्डवर नमूद केलेल्या सर्व खोल्या किंवा बेडला लागू होईल."
                )}
              </span>
              <button
                type="button"
                onClick={() => void saveDelayedCheckoutRates()}
                disabled={savingKey !== null}
              >
                {savingKey === "delayed-checkout-rates"
                  ? tr("Saving…", "जतन होत आहे...")
                  : tr("Save shared fine rates", "सामायिक दंडाचे दर जतन करा")}
              </button>
            </div>
          </section>
          <div className="customize-rate-sections">
            {groupedRooms.map(({ group, rooms: groupRooms }) => (
              <section className={`customize-rate-category category-${group.toLowerCase()}`} key={group}>
                <header className="customize-rate-category-heading">
                  <div>
                    <span>{tr("ROOM CATEGORY", "खोलीचा प्रकार")}</span>
                    <h2>{group}</h2>
                  </div>
                  <small>
                    {group === "DM"
                      ? tr(`${groupRooms.length} rooms · shared rates`, `${groupRooms.length} खोल्या · समान दर`)
                      : tr(`${groupRooms.length} rooms`, `${groupRooms.length} खोल्या`)}
                  </small>
                </header>

                {group === "DM" ? (
                  <>
                    <div className="customize-rate-grid">
                      <article className="customize-rate-card customize-rate-shared-card">
                        <div className="customize-rate-card-heading">
                          <div className="customize-rate-room-mark" aria-hidden="true">DM</div>
                          <div>
                            <span>{tr("ONE RATE SET FOR EVERY DM", "सर्व DM साठी एकच दर")}</span>
                            <h3>{tr("Shared DM rates", "सामायिक DM दर")}</h3>
                          </div>
                        </div>
                        <div className="customize-rate-fields">
                          {dmRateFields.map((field) => (
                              <label className="customize-rate-field" key={field.key}>
                                <span>{tr(field.label, field.label)}</span>
                                <span className="customize-rate-input-wrap">
                                  <span>₹</span>
                                  <input
                                    aria-label={`Shared DM ${field.label}`}
                                    type="number"
                                    min={field.min}
                                    step={field.step}
                                    value={dmRates[field.key]}
                                    onChange={(event) => {
                                      setDmRates((current) => ({
                                        ...current,
                                        [field.key]: event.target.value,
                                      }));
                                      setMessage("");
                                    }}
                                  />
                                </span>
                              </label>
                            ))}
                        </div>
                        {dmRatesDiffer && (
                          <p className="customize-rate-warning">
                            {tr(
                              "Existing DM rates differ. Saving these values will standardize all DM rooms.",
                              "सध्याचे DM दर वेगवेगळे आहेत. जतन केल्यावर सर्व बुकिंगसाठी उपलब्ध DM खोल्यांचे दर समान होतील."
                            )}
                          </p>
                        )}
                        <div className="customize-rate-card-footer">
                          <span>{tr("Applies to every bookable DM room.", "बुकिंगसाठी उपलब्ध प्रत्येक DM खोलीला लागू.")}</span>
                          <button
                            type="button"
                            onClick={() => void saveDmRates()}
                            disabled={savingKey !== null}
                          >
                            {savingKey === "dm-rates"
                              ? tr("Saving…", "जतन होत आहे...")
                              : tr("Save DM rates", "DM दर जतन करा")}
                          </button>
                        </div>
                      </article>
                    </div>

                    <section className="customize-room-identity-list">
                      <h3>{tr("DM room names and categories", "DM खोलीचे नाव आणि प्रकार")}</h3>
                      <p>
                        {tr(
                          "Change the room number or switch this vacant room to AC or NAC.",
                          "रिकाम्या खोलीचा क्रमांक बदला किंवा प्रकार AC / NAC करा."
                        )}
                      </p>
                      <div className="customize-rate-grid">
                        {groupRooms
                          .filter((room) => room.is_bookable)
                          .map((room) => (
                          <article className="customize-rate-card" key={`identity:${room.id}`}>
                            <div className="customize-rate-card-heading">
                              <div className="customize-rate-room-mark" aria-hidden="true">DM</div>
                              <div>
                                <span>{room.category_name}</span>
                                <h3>{room.room_number}</h3>
                                {renderRoomInventoryBadges(room)}
                              </div>
                            </div>
                            {renderRoomIdentityEditor(room)}
                          </article>
                        ))}
                      </div>
                    </section>

                    <details className="customize-dm-capacities">
                      <summary>
                        {tr("Manage capacity for each DM room", "प्रत्येक DM खोलीची क्षमता व्यवस्थापित करा")}
                      </summary>
                      <div className="customize-rate-grid">
                        {groupRooms.map((room) => (
                          <article className="customize-rate-card customize-dm-capacity-card" key={room.id}>
                            <div className="customize-rate-card-heading">
                              <div className="customize-rate-room-mark" aria-hidden="true">DM</div>
                              <div>
                                <span>{room.category_name}</span>
                                <h3>{room.room_number}</h3>
                                {renderRoomInventoryBadges(room)}
                              </div>
                              <div className="customize-rate-bed-summary">
                                <strong>{room.total_beds}</strong>
                                <span>{tr("physical beds", "उपलब्ध बेड")}</span>
                              </div>
                            </div>
                            {renderMaintenanceControl(room)}
                            <div className="customize-rate-fields">
                              {fields
                                .filter((field) => field.key.endsWith("_capacity"))
                                .map((field) => (
                                  <label className="customize-rate-field" key={field.key}>
                                    <span>{tr(field.label, field.label)}</span>
                                    <span className="customize-rate-input-wrap">
                                      <input
                                        aria-label={`${room.room_number} ${field.label}`}
                                        type="number"
                                        min={field.min}
                                        step={field.step}
                                        value={room[field.key] ?? ""}
                                        onChange={(event) =>
                                          updateRoom(room.id, field.key, event.target.value)
                                        }
                                      />
                                    </span>
                                  </label>
                                ))}
                            </div>
                            <div className="customize-rate-card-footer">
                              <span>{tr("Capacity only", "फक्त क्षमता")}</span>
                              <button
                                type="button"
                                onClick={() => void saveRoom(room)}
                                disabled={savingKey !== null}
                              >
                                {savingKey === `room:${room.id}`
                                  ? tr("Saving…", "जतन होत आहे...")
                                  : tr("Save capacity", "क्षमता जतन करा")}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </details>
                  </>
                ) : (
                  <div className="customize-rate-grid">
                    {groupRooms.map((room) => (
                      <article className="customize-rate-card" key={room.id}>
                        <div className="customize-rate-card-heading">
                          <div className="customize-rate-room-mark" aria-hidden="true">
                            {group}
                          </div>
                          <div>
                            <span>{room.category_name}</span>
                            <h3>{room.room_number}</h3>
                            {renderRoomInventoryBadges(room)}
                          </div>
                          <div className="customize-rate-bed-summary">
                            <strong>{room.total_beds}</strong>
                            <span>{tr("physical beds", "उपलब्ध बेड")}</span>
                          </div>
                        </div>
                        {room.is_bookable &&
                          ["AC", "NAC", "DM"].includes(group) &&
                          renderRoomIdentityEditor(room)}
                        {renderMaintenanceControl(room)}
                        {renderRoomFields(room)}
                        <div className="customize-rate-card-footer">
                          <span>
                            {room.esm_room_rate == null &&
                            room.serving_room_rate == null &&
                            room.civilian_room_rate == null
                              ? tr("Rates not configured", "दर कॉन्फिगर केलेले नाहीत")
                              : tr("Room settings", "खोलीची सेटिंग्ज")}
                          </span>
                          <button
                            type="button"
                            onClick={() => void saveRoom(room)}
                            disabled={savingKey !== null}
                          >
                            {savingKey === `room:${room.id}`
                              ? tr("Saving…", "जतन होत आहे...")
                              : tr("Save", "जतन करा")}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
          </>
        )}
      </section>
    </main>
  );
}

export default CustomizeRates;
