import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useLanguage } from "../i18n/LanguageContext";
import "../App.css";

type RoomCategory = "AC" | "NON_AC" | "DORMITORY" | "VIP" | "HALL";
type GenderRestriction = "ANY" | "MALE" | "FEMALE";

interface RoomCustomization {
  id: string;
  room_number: string;
  category_name: string;
  total_beds: number;
  is_bookable: boolean;
  gender_restriction: GenderRestriction;
  room_note: string | null;
  is_under_maintenance: boolean;
}

interface RoomCustomizationDraft {
  room_number: string;
  category: RoomCategory;
  total_beds: string;
  is_bookable: boolean;
  gender_restriction: GenderRestriction;
  room_note: string;
}

interface RoomCustomizationsProps {
  onBack: () => void;
}

const getCategory = (categoryName: string): RoomCategory => {
  const normalized = categoryName.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized.includes("DORMITORY") || normalized === "DM") return "DORMITORY";
  if (normalized === "NON_AC" || normalized === "NAC") return "NON_AC";
  if (normalized.includes("VIP")) return "VIP";
  if (normalized === "HALL") return "HALL";
  return "AC";
};

const categoryLabel = (category: RoomCategory): string => {
  switch (category) {
    case "NON_AC":
      return "NAC";
    case "DORMITORY":
      return "DM";
    default:
      return category;
  }
};

const toDraft = (room: RoomCustomization): RoomCustomizationDraft => ({
  room_number: room.room_number,
  category: getCategory(room.category_name),
  total_beds: String(room.total_beds),
  is_bookable: room.is_bookable,
  gender_restriction: room.gender_restriction ?? "ANY",
  room_note: room.room_note ?? "",
});

function RoomCustomizations({ onBack }: RoomCustomizationsProps) {
  const { language } = useLanguage();
  const isMarathi = language === "mr";
  const tr = (english: string, marathi: string) =>
    isMarathi ? marathi : english;

  const [rooms, setRooms] = useState<RoomCustomization[]>([]);
  const [drafts, setDrafts] = useState<Record<string, RoomCustomizationDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadRooms = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch(
        "http://localhost:5000/api/rooms/rate-card"
      );
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.rooms)) {
        throw new Error(data.message || "Unable to load room inventory.");
      }
      const loadedRooms = data.rooms as RoomCustomization[];
      setRooms(loadedRooms);
      setDrafts(
        Object.fromEntries(
          loadedRooms.map((room) => [room.id, toDraft(room)])
        )
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load room inventory."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRooms();
  }, []);

  const groupedRooms = useMemo(() => {
    const groups = new Map<string, RoomCustomization[]>();
    for (const room of rooms) {
      const group = categoryLabel(getCategory(room.category_name));
      groups.set(group, [...(groups.get(group) ?? []), room]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      ["AC", "NAC", "VIP", "DM", "HALL"].indexOf(left) -
      ["AC", "NAC", "VIP", "DM", "HALL"].indexOf(right)
    );
  }, [rooms]);

  const updateDraft = (
    roomId: string,
    patch: Partial<RoomCustomizationDraft>
  ) => {
    setDrafts((current) => ({
      ...current,
      [roomId]: { ...current[roomId], ...patch },
    }));
    setMessage("");
  };

  const saveRoom = async (room: RoomCustomization) => {
    const draft = drafts[room.id];
    if (!draft) return;

    const capacity = Number(draft.total_beds);
    if (
      !draft.room_number.trim() ||
      !Number.isInteger(capacity) ||
      capacity < 0 ||
      capacity > 500
    ) {
      setError(
        tr(
          "Enter a room number and a whole bed capacity from 0 to 500.",
          "खोली क्रमांक आणि 0 ते 500 मधील पूर्णांक बेड क्षमता भरा."
        )
      );
      return;
    }
    if (draft.is_bookable && capacity === 0) {
      setError(
        tr(
          "A bookable room must have at least one bed.",
          "बुकिंगसाठी खोलीत किमान एक बेड असणे आवश्यक आहे."
        )
      );
      return;
    }

    setSavingRoomId(room.id);
    setError("");
    setMessage("");
    try {
      const response = await apiFetch(
        `http://localhost:5000/api/rooms/${room.id}/customization`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_number: draft.room_number.trim(),
            category: draft.category,
            total_beds: capacity,
            is_bookable: draft.is_bookable,
            gender_restriction:
              draft.category === "DORMITORY"
                ? draft.gender_restriction
                : "ANY",
            room_note: draft.room_note.trim() || null,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.success || !data.room) {
        throw new Error(data.message || "Unable to save room customizations.");
      }
      setRooms((current) =>
        current.map((currentRoom) =>
          currentRoom.id === room.id
            ? { ...currentRoom, ...data.room }
            : currentRoom
        )
      );
      setDrafts((current) => ({
        ...current,
        [room.id]: toDraft({ ...room, ...data.room }),
      }));
      setMessage(
        tr(
          `Saved customizations for ${data.room.room_number}.`,
          `${data.room.room_number} साठी बदल जतन केले.`
        )
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save room customizations."
      );
    } finally {
      setSavingRoomId(null);
    }
  };

  return (
    <main className="room-customizations-screen">
      <header className="room-customizations-header">
        <button
          type="button"
          className="customize-rates-back"
          onClick={onBack}
        >
          ← {tr("Dashboard", "डॅशबोर्ड")}
        </button>
        <div>
          <span className="customize-rates-eyebrow">
            {tr("ADMINISTRATION", "प्रशासन")}
          </span>
          <h1>{tr("Room Customizations", "खोलीची सानुकूलित सेटिंग्ज")}</h1>
          <p>
            {tr(
              "Manage room numbers, categories, bed capacity, gender restrictions and booking access.",
              "खोली क्रमांक, प्रकार, बेड क्षमता, लिंग मर्यादा आणि बुकिंग परवानगी व्यवस्थापित करा."
            )}
          </p>
        </div>
        <button
          type="button"
          className="room-customizations-refresh"
          onClick={() => void loadRooms()}
          disabled={loading || savingRoomId !== null}
        >
          {tr("Refresh", "रीफ्रेश")}
        </button>
      </header>

      <section className="room-customizations-content">
        <aside className="customize-rates-notice">
          <span aria-hidden="true">i</span>
          <p>
            {tr(
              "Room changes are blocked while bookings, allotments, occupied/unavailable beds or unfinished housekeeping exist. Retired rooms and booking history are preserved.",
              "बुकिंग, वाटप, व्यापलेले/अनुपलब्ध बेड किंवा अपूर्ण हाऊसकीपिंग असताना बदल रोखले जातात. जुने rooms आणि booking history जतन राहते."
            )}
          </p>
        </aside>

        {error && <p className="customize-rates-error" role="alert">{error}</p>}
        {message && <p className="customize-rates-success" role="status">{message}</p>}

        {loading ? (
          <div className="customize-rates-empty">
            {tr("Loading room inventory…", "खोलीची यादी लोड होत आहे...")}
          </div>
        ) : rooms.length === 0 ? (
          <div className="customize-rates-empty">
            {tr("No active rooms found.", "सक्रिय खोल्या सापडल्या नाहीत.")}
          </div>
        ) : (
          <div className="room-customization-groups">
            {groupedRooms.map(([group, groupRooms]) => (
              <section className="room-customization-group" key={group}>
                <header>
                  <h2>{group}</h2>
                  <span>{groupRooms.length} {tr("rooms", "खोल्या")}</span>
                </header>
                <div className="room-customization-grid">
                  {groupRooms.map((room) => {
                    const draft = drafts[room.id];
                    if (!draft) return null;
                    const saving = savingRoomId === room.id;
                    return (
                      <article className="room-customization-card" key={room.id}>
                        <div className="room-customization-card-title">
                          <div>
                            <span>{room.category_name}</span>
                            <h3>{room.room_number}</h3>
                          </div>
                          <span className={`room-customization-state ${room.is_bookable ? "bookable" : "staff"}`}>
                            {room.is_bookable
                              ? tr("Bookable", "बुकिंगसाठी")
                              : tr("Staff / storage", "स्टाफ / स्टोअर")}
                          </span>
                        </div>
                        {room.is_under_maintenance && (
                          <p className="room-customization-warning">
                            {tr("Currently under maintenance", "सध्या देखभाल सुरू आहे")}
                          </p>
                        )}
                        <div className="room-customization-fields">
                          <label>
                            <span>{tr("Room number", "खोली क्रमांक")}</span>
                            <input
                              maxLength={50}
                              value={draft.room_number}
                              onChange={(event) =>
                                updateDraft(room.id, { room_number: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span>{tr("Category", "प्रकार")}</span>
                            <select
                              value={draft.category}
                              onChange={(event) => {
                                const category = event.target.value as RoomCategory;
                                updateDraft(room.id, {
                                  category,
                                  gender_restriction:
                                    category === "DORMITORY"
                                      ? draft.gender_restriction
                                      : "ANY",
                                });
                              }}
                            >
                              <option value="AC">AC</option>
                              <option value="NON_AC">NAC</option>
                              <option value="VIP">VIP</option>
                              <option value="DORMITORY">DM / Dormitory</option>
                              <option value="HALL">Hall</option>
                            </select>
                          </label>
                          <label>
                            <span>{tr("Physical beds", "बेड क्षमता")}</span>
                            <input
                              type="number"
                              min="0"
                              max="500"
                              step="1"
                              value={draft.total_beds}
                              onChange={(event) =>
                                updateDraft(room.id, { total_beds: event.target.value })
                              }
                            />
                          </label>
                          <label>
                            <span>{tr("DM guest restriction", "DM अतिथी मर्यादा")}</span>
                            <select
                              value={draft.gender_restriction}
                              disabled={draft.category !== "DORMITORY"}
                              onChange={(event) =>
                                updateDraft(room.id, {
                                  gender_restriction: event.target.value as GenderRestriction,
                                })
                              }
                            >
                              <option value="ANY">{tr("Any gender", "कोणतेही लिंग")}</option>
                              <option value="MALE">{tr("Male", "पुरुष")}</option>
                              <option value="FEMALE">{tr("Female", "महिला")}</option>
                            </select>
                          </label>
                          <label className="room-customization-note">
                            <span>{tr("Room note / staff label", "टीप / स्टाफ लेबल")}</span>
                            <input
                              maxLength={120}
                              value={draft.room_note}
                              onChange={(event) =>
                                updateDraft(room.id, { room_note: event.target.value })
                              }
                              placeholder={tr("e.g. Staff, Cook, Store Room", "उदा. स्टाफ, कुक, स्टोअर")}
                            />
                          </label>
                        </div>
                        <label className="room-customization-bookable">
                          <input
                            type="checkbox"
                            checked={draft.is_bookable}
                            onChange={(event) =>
                              updateDraft(room.id, { is_bookable: event.target.checked })
                            }
                          />
                          <span>{tr("Available for guest bookings and allotment", "अतिथी बुकिंग आणि वाटपासाठी उपलब्ध")}</span>
                        </label>
                        <button
                          type="button"
                          className="room-customization-save"
                          onClick={() => void saveRoom(room)}
                          disabled={savingRoomId !== null}
                        >
                          {saving
                            ? tr("Saving…", "जतन होत आहे...")
                            : tr("Save room customizations", "खोलीचे बदल जतन करा")}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default RoomCustomizations;
