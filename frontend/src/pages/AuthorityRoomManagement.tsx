import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../api";

interface AuthorityRoom {
  id: string;
  room_number: string;
  category_name: string;
  authority_role: string;
}

interface AvailableRoom {
  id: string;
  room_number: string;
  category_name: string;
}

interface AuthorityRoomData {
  rooms: AuthorityRoom[];
  eligibleRooms: AvailableRoom[];
  authorities: string[];
}

interface AuthorityRoomManagementProps {
  onBack: () => void;
}

const endpoint = "http://localhost:5000/api/rooms/authority-management";

function AuthorityRoomManagement({
  onBack,
}: AuthorityRoomManagementProps) {
  const [data, setData] = useState<AuthorityRoomData>({
    rooms: [],
    eligibleRooms: [],
    authorities: [],
  });
  const [roomAuthorities, setRoomAuthorities] = useState<Record<string, string>>({});
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedAuthority, setSelectedAuthority] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const response = await apiFetch(endpoint);
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load authority room settings.");
      }

      const nextData: AuthorityRoomData = {
        rooms: result.rooms,
        eligibleRooms: result.eligibleRooms,
        authorities: result.authorities,
      };
      setData(nextData);
      setRoomAuthorities(
        Object.fromEntries(
          nextData.rooms.map((room) => [room.id, room.authority_role])
        )
      );
      setSelectedRoomId((current) =>
        nextData.eligibleRooms.some((room) => room.id === current)
          ? current
          : ""
      );
      setSelectedAuthority((current) =>
        nextData.authorities.includes(current)
          ? current
          : nextData.authorities[0] ?? ""
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load authority room settings."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveAuthority = async (
    roomId: string,
    authorityRole: string
  ): Promise<boolean> => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await apiFetch(`${endpoint}/${roomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority_role: authorityRole }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to save the room authority.");
      }
      setSuccessMessage("Authority room settings saved.");
      await loadSettings();
      return true;
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save the room authority."
      );
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeAuthority = async (room: AuthorityRoom) => {
    if (
      !window.confirm(
        `Remove authority approval for ${room.room_number}? Future bookings will go to Receptionist approval.`
      )
    ) {
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await apiFetch(`${endpoint}/${room.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to remove the room authority.");
      }
      setSuccessMessage(`${room.room_number} now uses Receptionist approval.`);
      await loadSettings();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to remove the room authority."
      );
    } finally {
      setSaving(false);
    }
  };

  const addAuthorityRoom = async () => {
    if (!selectedRoomId || !selectedAuthority) {
      setErrorMessage("Select both a room and an authority.");
      return;
    }
    if (await saveAuthority(selectedRoomId, selectedAuthority)) {
      setShowAddForm(false);
    }
  };

  return (
    <main className="authority-management-page">
      <header className="authority-management-header">
        <div>
          <p>ADMINISTRATION</p>
          <h1>Authority Rooms</h1>
          <span>Choose which rooms require authority approval.</span>
        </div>
        <button type="button" className="back-button" onClick={onBack}>
          ← Dashboard
        </button>
      </header>

      {errorMessage && (
        <div className="authority-management-message error" role="alert">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="authority-management-message success" role="status">
          {successMessage}
        </div>
      )}

      <section className="authority-management-card">
        <div className="authority-management-section-heading">
          <div>
            <h2>Rooms requiring authority approval</h2>
            <p>Change the assigned authority or return a room to Receptionist approval.</p>
          </div>
        </div>

        {loading ? (
          <p className="authority-management-empty">Loading room settings…</p>
        ) : data.rooms.length === 0 ? (
          <p className="authority-management-empty">No rooms currently require authority approval.</p>
        ) : (
          <div className="authority-management-table-wrap">
            <table className="authority-management-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Category</th>
                  <th>Approving authority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rooms.map((room) => (
                  <tr key={room.id}>
                    <td>{room.room_number}</td>
                    <td>{room.category_name}</td>
                    <td>
                      <select
                        aria-label={`Authority for ${room.room_number}`}
                        value={roomAuthorities[room.id] ?? room.authority_role}
                        onChange={(event) =>
                          setRoomAuthorities((current) => ({
                            ...current,
                            [room.id]: event.target.value,
                          }))
                        }
                      >
                        {data.authorities.map((authority) => (
                          <option key={authority} value={authority}>
                            {authority.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="authority-management-actions">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() =>
                          void saveAuthority(
                            room.id,
                            roomAuthorities[room.id] ?? room.authority_role
                          )
                        }
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="remove"
                        disabled={saving}
                        onClick={() => void removeAuthority(room)}
                      >
                        Remove authority
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="authority-management-card">
        <div className="authority-management-section-heading">
          <div>
            <h2>Add Authority Rooms</h2>
            <p>Assign an authority to an active, bookable room not already assigned.</p>
          </div>
          <button
            type="button"
            className="authority-management-add-button"
            onClick={() => setShowAddForm((current) => !current)}
            aria-expanded={showAddForm}
          >
            {showAddForm ? "Cancel" : "Add Authority Rooms"}
          </button>
        </div>
        {showAddForm && (
          <>
            <div className="authority-management-add-form">
              <label>
                Room
                <select
                  value={selectedRoomId}
                  onChange={(event) => setSelectedRoomId(event.target.value)}
                  disabled={loading || saving}
                >
                  <option value="">Select a room</option>
                  {data.eligibleRooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.room_number} — {room.category_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Authority
                <select
                  value={selectedAuthority}
                  onChange={(event) => setSelectedAuthority(event.target.value)}
                  disabled={loading || saving || data.authorities.length === 0}
                >
                  <option value="">Select an authority</option>
                  {data.authorities.map((authority) => (
                    <option key={authority} value={authority}>
                      {authority.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="authority-management-add-button"
                onClick={() => void addAuthorityRoom()}
                disabled={loading || saving || !selectedRoomId || !selectedAuthority}
              >
                Save Authority Room
              </button>
            </div>
            {!loading && data.eligibleRooms.length === 0 && (
              <p className="authority-management-empty">There are no unassigned rooms available.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}

export default AuthorityRoomManagement;
