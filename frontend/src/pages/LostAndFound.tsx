import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import "../App.css";
import { apiFetch } from "../api";

import { useLanguage } from "../i18n/LanguageContext";

const API_BASE_URL = "http://localhost:5000";


/* =========================================================
   TYPES
   ========================================================= */

interface User {
  id: string;
  full_name?: string;
  username?: string;
  role_id?: number;
  role: string;
}
interface Room {
  id: string;
  room_number: string;
}

interface LostAndFoundItem {
  id: string;

  item_name: string;
  item_description: string | null;

  room_id: string | null;
  booking_id: string | null;
  guest_id: string | null;

  room_number: string | null;
  guest_name: string | null;
  booking_reference: string | null;

  found_date: string;
  found_by: string | null;

  received_by: string;
  received_by_name: string | null;

  status: "FOUND" | "RETURNED";

  returned_date: string | null;
  returned_to: string | null;
  return_remarks: string | null;

  created_at: string;
  updated_at: string;
}

interface RoomGuestBooking {
  booking_id: string;
  guest_id: string;

  booking_reference: string;

  check_in_date: string;
  expected_check_out_date: string;

  booking_status: string;
  approval_status: string;

  guest_name: string;
  mobile_number: string | null;
  email: string | null;

  allotment_status: string;
  allotted_at: string;
  released_at: string | null;
}


/* =========================================================
   PROPS
   ========================================================= */

interface LostAndFoundProps {
  user: User;
  onBack: () => void;
}


/* =========================================================
   COMPONENT
   ========================================================= */

const LostAndFound: React.FC<
  LostAndFoundProps
> = ({
  user,
  onBack,
}) => {

  const {
    language,
    toggleLanguage,
  } = useLanguage();


  /* =======================================================
     STATE
     ======================================================= */

  const [
    items,
    setItems,
  ] = useState<LostAndFoundItem[]>([]);

  const [
    rooms,
    setRooms,
  ] = useState<Room[]>([]);

  const [
    roomGuests,
    setRoomGuests,
  ] = useState<RoomGuestBooking[]>([]);

  const [
    loading,
    setLoading,
  ] = useState<boolean>(true);

  const [
    loadingRoomGuests,
    setLoadingRoomGuests,
  ] = useState<boolean>(false);

  const [
    saving,
    setSaving,
  ] = useState<boolean>(false);

  const [
    returning,
    setReturning,
  ] = useState<boolean>(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    statusFilter,
    setStatusFilter,
  ] = useState<
    "ALL" | "FOUND" | "RETURNED"
  >("ALL");


  /* =======================================================
     ADD MODAL
     ======================================================= */

  const [
    showAddModal,
    setShowAddModal,
  ] = useState<boolean>(false);


  /* =======================================================
     RETURN MODAL
     ======================================================= */

  const [
    returnItem,
    setReturnItem,
  ] = useState<LostAndFoundItem | null>(
    null
  );


  /* =======================================================
     VIEW MODAL
     ======================================================= */

  const [
    viewItem,
    setViewItem,
  ] = useState<LostAndFoundItem | null>(
    null
  );


  /* =======================================================
     FORM
     ======================================================= */

  const [
    itemName,
    setItemName,
  ] = useState("");

  const [
    itemDescription,
    setItemDescription,
  ] = useState("");

  const [
    selectedRoomId,
    setSelectedRoomId,
  ] = useState("");

  const [
    selectedGuestId,
    setSelectedGuestId,
  ] = useState("");

  const [
    selectedBookingId,
    setSelectedBookingId,
  ] = useState("");

  const [
    foundDate,
    setFoundDate,
  ] = useState(
    new Date()
      .toISOString()
      .split("T")[0]
  );

  const [
    foundBy,
    setFoundBy,
  ] = useState("");


  /* =======================================================
     RETURN FORM
     ======================================================= */

  const [
    returnedTo,
    setReturnedTo,
  ] = useState("");

  const [
    returnedDate,
    setReturnedDate,
  ] = useState(
    new Date()
      .toISOString()
      .split("T")[0]
  );

  const [
    returnRemarks,
    setReturnRemarks,
  ] = useState("");


  /* =======================================================
     MESSAGE MODAL
     ======================================================= */

  const [
    messageModal,
    setMessageModal,
  ] = useState<{
    title: string;
    message: string;
  } | null>(null);


  /* =======================================================
     HELPERS
     ======================================================= */

  const tr = (
    english: string,
    marathi: string
  ) => {
    return language === "mr"
      ? marathi
      : english;
  };


  const formatDate = (
    value: string | null
  ) => {

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

    return date.toLocaleDateString(
      language === "mr"
        ? "mr-IN"
        : "en-IN",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }
    );
  };


  const showMessage = (
    title: string,
    message: string
  ) => {
    setMessageModal({
      title,
      message,
    });
  };


  /* =======================================================
     LOAD LOST & FOUND ITEMS
     ======================================================= */

  const loadItems = async () => {

    try {

      setLoading(true);

      const response =
        await apiFetch(
          `${API_BASE_URL}/api/lost-and-found`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load Lost & Found records."
        );
      }

      setItems(
        Array.isArray(data.items)
          ? data.items
          : []
      );

    } catch (error) {

      console.error(
        "Lost & Found load error:",
        error
      );

      showMessage(
        tr(
          "Error",
          "त्रुटी"
        ),
        error instanceof Error
          ? error.message
          : tr(
              "Failed to load Lost & Found records.",
              "हरवलेल्या व सापडलेल्या वस्तूंच्या नोंदी लोड करता आल्या नाहीत."
            )
      );

    } finally {

      setLoading(false);
    }
  };


  /* =======================================================
     LOAD ROOMS
     ======================================================= */

  const loadRooms = async () => {

    try {

      const response =
        await apiFetch(
          `${API_BASE_URL}/api/rooms?role=${encodeURIComponent(
            user.role
          )}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load rooms."
        );
      }


      /*
       * Support the existing rooms API whether it
       * returns:
       *
       * { rooms: [...] }
       *
       * or:
       *
       * [...]
       *
       * or another object containing a rooms array.
       */

      let roomList: unknown[] = [];


      if (
        Array.isArray(data)
      ) {

        roomList = data;

      } else if (
        data &&
        Array.isArray(data.rooms)
      ) {

        roomList = data.rooms;

      } else if (
        data &&
        Array.isArray(data.data)
      ) {

        roomList = data.data;

      }


      const normalizedRooms: Room[] =
        roomList
          .map(
            (room: unknown) => {
              if (!room || typeof room !== "object") {
                return { id: "", room_number: "" };
              }
              const roomRecord = room as Record<string, unknown>;
              return {
                id: String(roomRecord.id ?? roomRecord.room_id ?? ""),
                room_number: String(
                  roomRecord.room_number ??
                    roomRecord.roomNumber ??
                    roomRecord.room_name ??
                    ""
                ),
              };
            }
          )
          .filter(
            (room) =>
              Boolean(room.id) &&
              Boolean(
                room.room_number
              )
          );


      setRooms(
        normalizedRooms
      );


    } catch (error) {

      console.error(
        "Rooms load error:",
        error
      );

      setRooms([]);

      showMessage(
        tr(
          "Error",
          "त्रुटी"
        ),
        error instanceof Error
          ? error.message
          : tr(
              "Failed to load rooms.",
              "खोल्या लोड करता आल्या नाहीत."
            )
      );
    }
  };


  /* =======================================================
     INITIAL LOAD
     ======================================================= */

  useEffect(() => {

    // These calls initiate async API loads; state updates follow their responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadItems();
    loadRooms();

  }, []);


  /* =======================================================
     LOAD GUESTS FOR SELECTED ROOM
     ======================================================= */

  const loadRoomGuests = async (
    roomId: string
  ) => {

    if (!roomId) {

      setRoomGuests([]);
      setSelectedGuestId("");
      setSelectedBookingId("");

      return;
    }


    try {

      setLoadingRoomGuests(true);

      setRoomGuests([]);

      setSelectedGuestId("");
      setSelectedBookingId("");


      const response =
        await apiFetch(
          `${API_BASE_URL}/api/lost-and-found/room/${roomId}/guests`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            "Failed to load room guests."
        );
      }


      const guests =
        Array.isArray(data.guests)
          ? data.guests
          : [];


      setRoomGuests(
        guests
      );

    } catch (error) {

      console.error(
        "Room guests load error:",
        error
      );

      setRoomGuests([]);

      showMessage(
        tr(
          "Error",
          "त्रुटी"
        ),
        error instanceof Error
          ? error.message
          : tr(
              "Failed to load guests for the selected room.",
              "निवडलेल्या खोलीतील अतिथी लोड करता आले नाहीत."
            )
      );

    } finally {

      setLoadingRoomGuests(false);
    }
  };


  /* =======================================================
     ROOM CHANGE
     ======================================================= */

  const handleRoomChange = (
    roomId: string
  ) => {

    setSelectedRoomId(
      roomId
    );

    loadRoomGuests(
      roomId
    );
  };


  /* =======================================================
     GUEST CHANGE
     ======================================================= */

  const handleGuestChange = (
    guestId: string
  ) => {

    setSelectedGuestId(
      guestId
    );


    const selected =
      roomGuests.find(
        (guest) =>
          guest.guest_id ===
          guestId
      );


    if (selected) {

      setSelectedBookingId(
        selected.booking_id
      );

    } else {

      setSelectedBookingId(
        ""
      );
    }
  };


  /* =======================================================
     FILTER ITEMS
     ======================================================= */

  const filteredItems =
    useMemo(() => {

      const normalizedSearch =
        search
          .trim()
          .toLowerCase();


      return items.filter(
        (item) => {

          const matchesStatus =
            statusFilter === "ALL" ||
            item.status ===
              statusFilter;


          if (!matchesStatus) {
            return false;
          }


          if (
            !normalizedSearch
          ) {
            return true;
          }


          const searchableText =
            [
              item.item_name,
              item.item_description,
              item.room_number,
              item.guest_name,
              item.booking_reference,
              item.found_by,
              item.returned_to,
              item.return_remarks,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();


          return searchableText.includes(
            normalizedSearch
          );
        }
      );

    }, [
      items,
      search,
      statusFilter,
    ]);


  /* =======================================================
     SUMMARY
     ======================================================= */

  const totalItems =
    items.length;

  const foundItems =
    items.filter(
      (item) =>
        item.status ===
        "FOUND"
    ).length;

  const returnedItems =
    items.filter(
      (item) =>
        item.status ===
        "RETURNED"
    ).length;


  /* =======================================================
     RESET ADD FORM
     ======================================================= */

  const resetAddForm = () => {

    setItemName("");
    setItemDescription("");

    setSelectedRoomId("");
    setSelectedGuestId("");
    setSelectedBookingId("");

    setFoundDate(
      new Date()
        .toISOString()
        .split("T")[0]
    );

    setFoundBy("");

    setRoomGuests([]);
  };


  /* =======================================================
     CLOSE ADD MODAL
     ======================================================= */

  const closeAddModal = () => {

    if (saving) {
      return;
    }

    setShowAddModal(
      false
    );

    resetAddForm();
  };


  /* =======================================================
     CREATE LOST & FOUND ITEM
     ======================================================= */

  const handleCreateItem = async (
    event: React.FormEvent
  ) => {

    event.preventDefault();


    if (
      !itemName.trim()
    ) {

      showMessage(
        tr(
          "Required",
          "आवश्यक"
        ),
        tr(
          "Please enter the item name.",
          "कृपया वस्तूचे नाव प्रविष्ट करा."
        )
      );

      return;
    }


    if (
      !selectedRoomId
    ) {

      showMessage(
        tr(
          "Required",
          "आवश्यक"
        ),
        tr(
          "Please select the room where the item was found.",
          "वस्तू सापडलेली खोली निवडा."
        )
      );

      return;
    }


    if (
      roomGuests.length > 0 &&
      !selectedGuestId
    ) {

      showMessage(
        tr(
          "Guest Required",
          "अतिथी आवश्यक"
        ),
        tr(
          "Please select the guest associated with this room.",
          "या खोलीशी संबंधित अतिथी निवडा."
        )
      );

      return;
    }


    try {

      setSaving(true);


      const response =
        await apiFetch(
          `${API_BASE_URL}/api/lost-and-found`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                item_name:
                  itemName.trim(),

                item_description:
                  itemDescription.trim() ||
                  null,

                room_id:
                  selectedRoomId,

                booking_id:
                  selectedBookingId ||
                  null,

                guest_id:
                  selectedGuestId ||
                  null,

                found_date:
                  foundDate ||
                  null,

                found_by:
                  foundBy.trim() ||
                  null,

                received_by:
                  user.id,
              }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.message ||
            "Failed to record item."
        );
      }


      setShowAddModal(
        false
      );

      resetAddForm();

      await loadItems();


      showMessage(
        tr(
          "Success",
          "यशस्वी"
        ),
        tr(
          "Lost & Found item recorded successfully.",
          "हरवलेली व सापडलेली वस्तू यशस्वीरित्या नोंदवली आहे."
        )
      );

    } catch (error) {

      console.error(
        "Create Lost & Found error:",
        error
      );

      showMessage(
        tr(
          "Error",
          "त्रुटी"
        ),
        error instanceof Error
          ? error.message
          : tr(
              "Failed to record Lost & Found item.",
              "वस्तूची नोंद करता आली नाही."
            )
      );

    } finally {

      setSaving(false);
    }
  };


  /* =======================================================
     OPEN RETURN MODAL
     ======================================================= */

  const openReturnModal = (
    item: LostAndFoundItem
  ) => {

    setReturnItem(
      item
    );

    setReturnedTo(
      item.guest_name ||
        item.returned_to ||
        ""
    );

    setReturnedDate(
      new Date()
        .toISOString()
        .split("T")[0]
    );

    setReturnRemarks("");
  };


  /* =======================================================
     CLOSE RETURN MODAL
     ======================================================= */

  const closeReturnModal = () => {

    if (returning) {
      return;
    }

    setReturnItem(null);

    setReturnedTo("");
    setReturnedDate("");
    setReturnRemarks("");
  };


  /* =======================================================
     MARK RETURNED
     ======================================================= */

  const handleReturnItem = async (
    event: React.FormEvent
  ) => {

    event.preventDefault();


    if (!returnItem) {
      return;
    }


    if (
      !returnedTo.trim()
    ) {

      showMessage(
        tr(
          "Required",
          "आवश्यक"
        ),
        tr(
          "Please enter who received the item.",
          "वस्तू कोणाला परत केली ते प्रविष्ट करा."
        )
      );

      return;
    }


    try {

      setReturning(true);


      const response =
        await apiFetch(
          `${API_BASE_URL}/api/lost-and-found/${returnItem.id}/return`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                returned_date:
                  returnedDate ||
                  null,

                returned_to:
                  returnedTo.trim(),

                return_remarks:
                  returnRemarks.trim() ||
                  null,
              }),
          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.message ||
            "Failed to mark item as returned."
        );
      }


      closeReturnModal();

      await loadItems();


      showMessage(
        tr(
          "Success",
          "यशस्वी"
        ),
        tr(
          "Item marked as returned successfully.",
          "वस्तू परत केल्याची नोंद यशस्वीरित्या करण्यात आली."
        )
      );

    } catch (error) {

      console.error(
        "Return Lost & Found error:",
        error
      );

      showMessage(
        tr(
          "Error",
          "त्रुटी"
        ),
        error instanceof Error
          ? error.message
          : tr(
              "Failed to mark item as returned.",
              "वस्तू परत केल्याची नोंद करता आली नाही."
            )
      );

    } finally {

      setReturning(false);
    }
  };


  /* =======================================================
     SELECTED GUEST
     ======================================================= */

  const selectedGuest =
    roomGuests.find(
      (guest) =>
        guest.guest_id ===
        selectedGuestId
    );


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div
      style={{
        minHeight:
          "100vh",

        background:
          "linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)",

        padding:
          "28px",
      }}
    >

      <div
        style={{
          maxWidth:
            "1500px",

          margin:
            "0 auto",
        }}
      >

        {/* =================================================
            HEADER
            ================================================= */}

        <div
          style={{
            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "space-between",

            gap:
              "20px",

            marginBottom:
              "26px",

            flexWrap:
              "wrap",
          }}
        >

          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                "16px",
            }}
          >

            <button
              type="button"
              onClick={
                onBack
              }
              style={{
                border:
                  "1px solid #dbe2ea",

                background:
                  "#ffffff",

                color:
                  "#334155",

                borderRadius:
                  "12px",

                padding:
                  "10px 16px",

                cursor:
                  "pointer",

                fontWeight:
                  700,

                boxShadow:
                  "0 4px 12px rgba(15,23,42,0.06)",
              }}
            >
              ←{" "}
              {tr(
                "Back",
                "मागे"
              )}
            </button>


            <div>

              <div
                style={{
                  display:
                    "flex",

                  alignItems:
                    "center",

                  gap:
                    "12px",
                }}
              >

                <div
                  style={{
                    width:
                      "46px",

                    height:
                      "46px",

                    borderRadius:
                      "14px",

                    background:
                      "linear-gradient(135deg, #f97316, #ea580c)",

                    color:
                      "#ffffff",

                    display:
                      "flex",

                    alignItems:
                      "center",

                    justifyContent:
                      "center",

                    fontWeight:
                      900,

                    fontSize:
                      "15px",

                    boxShadow:
                      "0 8px 20px rgba(234,88,12,0.22)",
                  }}
                >
                  LF
                </div>


                <div>

                  <h1
                    style={{
                      margin:
                        0,

                      color:
                        "#0f172a",

                      fontSize:
                        "28px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Lost & Found",
                      "हरवलेल्या व सापडलेल्या वस्तू"
                    )}
                  </h1>


                  <p
                    style={{
                      margin:
                        "5px 0 0",

                      color:
                        "#64748b",

                      fontSize:
                        "14px",
                    }}
                  >
                    {tr(
                      "Manage guest belongings found in the ESM Rest House.",
                      "ESM विश्रामगृहात सापडलेल्या अतिथींच्या वस्तूंचे व्यवस्थापन करा."
                    )}
                  </p>

                </div>

              </div>

            </div>

          </div>


          <div
            style={{
              display:
                "flex",

              alignItems:
                "center",

              gap:
                "10px",
            }}
          >

            <div
              className="language-switcher"
            >

              <button
                type="button"
                className={`language-button ${
                  language ===
                  "en"
                    ? "active"
                    : ""
                }`}
                onClick={() => {

                  if (
                    language !==
                    "en"
                  ) {
                    toggleLanguage();
                  }

                }}
              >
                EN
              </button>


              <span
                className="language-divider"
              >
                |
              </span>


              <button
                type="button"
                className={`language-button ${
                  language ===
                  "mr"
                    ? "active"
                    : ""
                }`}
                onClick={() => {

                  if (
                    language !==
                    "mr"
                  ) {
                    toggleLanguage();
                  }

                }}
              >
                मराठी
              </button>

            </div>


            {user.role ===
              "RECEPTIONIST" && (

              <button
                type="button"
                onClick={() =>
                  setShowAddModal(
                    true
                  )
                }
                style={{
                  border:
                    "none",

                  background:
                    "linear-gradient(135deg, #f97316, #ea580c)",

                  color:
                    "#ffffff",

                  borderRadius:
                    "12px",

                  padding:
                    "12px 18px",

                  cursor:
                    "pointer",

                  fontWeight:
                    800,

                  boxShadow:
                    "0 8px 20px rgba(234,88,12,0.20)",
                }}
              >
                +{" "}
                {tr(
                  "Add Found Item",
                  "सापडलेली वस्तू नोंदवा"
                )}
              </button>

            )}

          </div>

        </div>


        {/* =================================================
            SUMMARY CARDS
            ================================================= */}

        <div
          style={{
            display:
              "grid",

            gridTemplateColumns:
              "repeat(3, minmax(0, 1fr))",

            gap:
              "16px",

            marginBottom:
              "22px",
          }}
        >

          <div
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #e2e8f0",

              borderRadius:
                "16px",

              padding:
                "20px",

              boxShadow:
                "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >

            <div
              style={{
                color:
                  "#64748b",

                fontSize:
                  "13px",

                fontWeight:
                  700,
              }}
            >
              {tr(
                "Total Items",
                "एकूण वस्तू"
              )}
            </div>


            <div
              style={{
                marginTop:
                  "8px",

                color:
                  "#0f172a",

                fontSize:
                  "30px",

                fontWeight:
                  900,
              }}
            >
              {totalItems}
            </div>

          </div>


          <div
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #fed7aa",

              borderRadius:
                "16px",

              padding:
                "20px",

              boxShadow:
                "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >

            <div
              style={{
                color:
                  "#9a3412",

                fontSize:
                  "13px",

                fontWeight:
                  700,
              }}
            >
              {tr(
                "Currently Found",
                "सध्या सापडलेल्या"
              )}
            </div>


            <div
              style={{
                marginTop:
                  "8px",

                color:
                  "#ea580c",

                fontSize:
                  "30px",

                fontWeight:
                  900,
              }}
            >
              {foundItems}
            </div>

          </div>


          <div
            style={{
              background:
                "#ffffff",

              border:
                "1px solid #bbf7d0",

              borderRadius:
                "16px",

              padding:
                "20px",

              boxShadow:
                "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >

            <div
              style={{
                color:
                  "#166534",

                fontSize:
                  "13px",

                fontWeight:
                  700,
              }}
            >
              {tr(
                "Returned",
                "परत केलेल्या"
              )}
            </div>


            <div
              style={{
                marginTop:
                  "8px",

                color:
                  "#16a34a",

                fontSize:
                  "30px",

                fontWeight:
                  900,
              }}
            >
              {returnedItems}
            </div>

          </div>

        </div>


        {/* =================================================
            FILTER BAR
            ================================================= */}

        <div
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "16px",

            padding:
              "16px",

            marginBottom:
              "18px",

            display:
              "flex",

            gap:
              "12px",

            alignItems:
              "center",

            flexWrap:
              "wrap",

            boxShadow:
              "0 8px 24px rgba(15,23,42,0.04)",
          }}
        >

          <input
            type="text"
            value={
              search
            }
            onChange={(
              event
            ) =>
              setSearch(
                event.target
                  .value
              )
            }
            placeholder={tr(
              "Search item, room, guest, booking...",
              "वस्तू, खोली, अतिथी, बुकिंग शोधा..."
            )}
            style={{
              flex:
                "1 1 320px",

              minWidth:
                "260px",

              border:
                "1px solid #cbd5e1",

              borderRadius:
                "10px",

              padding:
                "11px 13px",

              fontSize:
                "14px",

              outline:
                "none",
            }}
          />


          <select
            value={
              statusFilter
            }
            onChange={(
              event
            ) =>
              setStatusFilter(
                event.target
                  .value as
                  | "ALL"
                  | "FOUND"
                  | "RETURNED"
              )
            }
            style={{
              border:
                "1px solid #cbd5e1",

              borderRadius:
                "10px",

              padding:
                "11px 13px",

              fontSize:
                "14px",

              background:
                "#ffffff",

              minWidth:
                "170px",
            }}
          >

            <option value="ALL">
              {tr(
                "All Statuses",
                "सर्व स्थिती"
              )}
            </option>

            <option value="FOUND">
              {tr(
                "Found",
                "सापडलेली"
              )}
            </option>

            <option value="RETURNED">
              {tr(
                "Returned",
                "परत केलेली"
              )}
            </option>

          </select>

        </div>


        {/* =================================================
            TABLE
            ================================================= */}

        <div
          style={{
            background:
              "#ffffff",

            border:
              "1px solid #e2e8f0",

            borderRadius:
              "18px",

            overflow:
              "hidden",

            boxShadow:
              "0 10px 30px rgba(15,23,42,0.05)",
          }}
        >

          {loading ? (

            <div
              style={{
                padding:
                  "60px 20px",

                textAlign:
                  "center",

                color:
                  "#64748b",
              }}
            >
              {tr(
                "Loading Lost & Found records...",
                "हरवलेल्या व सापडलेल्या वस्तूंच्या नोंदी लोड होत आहेत..."
              )}
            </div>

          ) : filteredItems.length ===
            0 ? (

            <div
              style={{
                padding:
                  "70px 20px",

                textAlign:
                  "center",
              }}
            >

              <div
                style={{
                  fontSize:
                    "42px",

                  marginBottom:
                    "12px",
                }}
              >
                🔎
              </div>


              <div
                style={{
                  fontWeight:
                    800,

                  color:
                    "#334155",

                  fontSize:
                    "16px",
                }}
              >
                {tr(
                  "No Lost & Found records found.",
                  "हरवलेल्या व सापडलेल्या वस्तूंच्या नोंदी आढळल्या नाहीत."
                )}
              </div>


              <div
                style={{
                  color:
                    "#94a3b8",

                  marginTop:
                    "6px",

                  fontSize:
                    "13px",
                }}
              >
                {tr(
                  "Try changing the search or status filter.",
                  "शोध किंवा स्थिती फिल्टर बदला."
                )}
              </div>

            </div>

          ) : (

            <div
              style={{
                overflowX:
                  "auto",
              }}
            >

              <table
                style={{
                  width:
                    "100%",

                  borderCollapse:
                    "collapse",

                  minWidth:
                    "1050px",
                }}
              >

                <thead>

                  <tr
                    style={{
                      background:
                        "#f8fafc",

                      borderBottom:
                        "1px solid #e2e8f0",
                    }}
                  >

                    {[
                      tr(
                        "Item",
                        "वस्तू"
                      ),

                      tr(
                        "Room",
                        "खोली"
                      ),

                      tr(
                        "Guest",
                        "अतिथी"
                      ),

                      tr(
                        "Booking",
                        "बुकिंग"
                      ),

                      tr(
                        "Found Date",
                        "सापडल्याची तारीख"
                      ),

                      tr(
                        "Found By",
                        "सापडवणारे"
                      ),

                      tr(
                        "Status",
                        "स्थिती"
                      ),

                      tr(
                        "Action",
                        "कृती"
                      ),
                    ].map(
                      (
                        heading,
                        index
                      ) => (

                        <th
                          key={
                            index
                          }
                          style={{
                            textAlign:
                              "left",

                            padding:
                              "14px 16px",

                            fontSize:
                              "12px",

                            color:
                              "#64748b",

                            fontWeight:
                              800,

                            textTransform:
                              "uppercase",

                            letterSpacing:
                              "0.04em",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {
                            heading
                          }
                        </th>

                      )
                    )}

                  </tr>

                </thead>


                <tbody>

                  {filteredItems.map(
                    (
                      item
                    ) => (

                      <tr
                        key={
                          item.id
                        }
                        style={{
                          borderBottom:
                            "1px solid #f1f5f9",
                        }}
                      >

                        <td
                          style={{
                            padding:
                              "16px",

                            verticalAlign:
                              "top",
                          }}
                        >

                          <div
                            style={{
                              fontWeight:
                                800,

                              color:
                                "#0f172a",
                            }}
                          >
                            {
                              item.item_name
                            }
                          </div>


                          {item.item_description && (

                            <div
                              style={{
                                marginTop:
                                  "4px",

                                fontSize:
                                  "12px",

                                color:
                                  "#64748b",

                                maxWidth:
                                  "220px",
                              }}
                            >
                              {
                                item.item_description
                              }
                            </div>

                          )}

                        </td>


                        <td
                          style={{
                            padding:
                              "16px",

                            color:
                              "#334155",

                            fontWeight:
                              700,
                          }}
                        >
                          {
                            item.room_number ||
                            "-"
                          }
                        </td>


                        <td
                          style={{
                            padding:
                              "16px",

                            color:
                              "#334155",
                          }}
                        >

                          {item.guest_name ? (

                            <div
                              style={{
                                fontWeight:
                                  700,
                              }}
                            >
                              {
                                item.guest_name
                              }
                            </div>

                          ) : (
                            "-"
                          )}

                        </td>


                        <td
                          style={{
                            padding:
                              "16px",

                            color:
                              "#475569",

                            fontWeight:
                              700,
                          }}
                        >
                          {
                            item.booking_reference ||
                            "-"
                          }
                        </td>


                        <td
                          style={{
                            padding:
                              "16px",

                            color:
                              "#475569",

                            whiteSpace:
                              "nowrap",
                          }}
                        >
                          {formatDate(
                            item.found_date
                          )}
                        </td>


                        <td
                          style={{
                            padding:
                              "16px",

                            color:
                              "#475569",
                          }}
                        >
                          {
                            item.found_by ||
                            "-"
                          }
                        </td>


                        <td
                          style={{
                            padding:
                              "16px",
                          }}
                        >

                          <span
                            style={{
                              display:
                                "inline-flex",

                              alignItems:
                                "center",

                              padding:
                                "6px 10px",

                              borderRadius:
                                "999px",

                              fontSize:
                                "11px",

                              fontWeight:
                                800,

                              background:
                                item.status ===
                                "FOUND"
                                  ? "#fff7ed"
                                  : "#f0fdf4",

                              color:
                                item.status ===
                                "FOUND"
                                  ? "#c2410c"
                                  : "#15803d",

                              border:
                                item.status ===
                                "FOUND"
                                  ? "1px solid #fed7aa"
                                  : "1px solid #bbf7d0",
                            }}
                          >

                            {item.status ===
                            "FOUND"
                              ? tr(
                                  "FOUND",
                                  "सापडलेली"
                                )
                              : tr(
                                  "RETURNED",
                                  "परत केलेली"
                                )}

                          </span>

                        </td>


                        <td
                          style={{
                            padding:
                              "16px",
                          }}
                        >

                          <div
                            style={{
                              display:
                                "flex",

                              gap:
                                "8px",

                              flexWrap:
                                "wrap",
                            }}
                          >

                            {item.status ===
                              "FOUND" &&
                              user.role ===
                                "RECEPTIONIST" && (

                              <button
                                type="button"
                                onClick={() =>
                                  openReturnModal(
                                    item
                                  )
                                }
                                style={{
                                  border:
                                    "none",

                                  background:
                                    "#16a34a",

                                  color:
                                    "#ffffff",

                                  borderRadius:
                                    "9px",

                                  padding:
                                    "8px 11px",

                                  cursor:
                                    "pointer",

                                  fontWeight:
                                    800,

                                  fontSize:
                                    "12px",
                                }}
                              >
                                {tr(
                                  "Mark Returned",
                                  "परत केले"
                                )}
                              </button>

                            )}


                            {item.status ===
                              "RETURNED" && (

                              <button
                                type="button"
                                onClick={() =>
                                  setViewItem(
                                    item
                                  )
                                }
                                style={{
                                  border:
                                    "1px solid #cbd5e1",

                                  background:
                                    "#ffffff",

                                  color:
                                    "#334155",

                                  borderRadius:
                                    "9px",

                                  padding:
                                    "8px 11px",

                                  cursor:
                                    "pointer",

                                  fontWeight:
                                    800,

                                  fontSize:
                                    "12px",
                                }}
                              >
                                {tr(
                                  "View",
                                  "पहा"
                                )}
                              </button>

                            )}

                          </div>

                        </td>

                      </tr>

                    )
                  )}

                </tbody>

              </table>

            </div>

          )}

        </div>

      </div>


      {/* ===================================================
          ADD ITEM MODAL
          =================================================== */}

      {showAddModal && (

        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            background:
              "rgba(15,23,42,0.55)",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            padding:
              "20px",

            zIndex:
              1000,
          }}
        >

          <div
            style={{
              width:
                "100%",

              maxWidth:
                "720px",

              maxHeight:
                "calc(100vh - 40px)",

              overflowY:
                "auto",

              background:
                "#ffffff",

              borderRadius:
                "20px",

              boxShadow:
                "0 25px 70px rgba(15,23,42,0.25)",
            }}
          >

            <div
              style={{
                padding:
                  "22px 24px",

                borderBottom:
                  "1px solid #e2e8f0",

                display:
                  "flex",

                alignItems:
                  "center",

                justifyContent:
                  "space-between",
              }}
            >

              <div>

                <h2
                  style={{
                    margin:
                      0,

                    color:
                      "#0f172a",

                    fontSize:
                      "21px",

                    fontWeight:
                      850,
                  }}
                >
                  {tr(
                    "Record Found Item",
                    "सापडलेली वस्तू नोंदवा"
                  )}
                </h2>


                <p
                  style={{
                    margin:
                      "5px 0 0",

                    color:
                      "#64748b",

                    fontSize:
                      "13px",
                  }}
                >
                  {tr(
                    "Link the item to the room and guest whenever possible.",
                    "शक्य असल्यास वस्तू खोली व अतिथीशी लिंक करा."
                  )}
                </p>

              </div>


              <button
                type="button"
                onClick={
                  closeAddModal
                }
                disabled={
                  saving
                }
                style={{
                  width:
                    "36px",

                  height:
                    "36px",

                  border:
                    "1px solid #e2e8f0",

                  borderRadius:
                    "10px",

                  background:
                    "#ffffff",

                  color:
                    "#64748b",

                  cursor:
                    saving
                      ? "not-allowed"
                      : "pointer",

                  fontSize:
                    "18px",
                }}
              >
                ×
              </button>

            </div>


            <form
              onSubmit={
                handleCreateItem
              }
            >

              <div
                style={{
                  padding:
                    "24px",

                  display:
                    "grid",

                  gap:
                    "17px",
                }}
              >

                {/* ITEM NAME */}

                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Item Name",
                      "वस्तूचे नाव"
                    )}{" "}

                    <span
                      style={{
                        color:
                          "#dc2626",
                      }}
                    >
                      *
                    </span>

                  </label>


                  <input
                    type="text"
                    value={
                      itemName
                    }
                    onChange={(
                      event
                    ) =>
                      setItemName(
                        event.target
                          .value
                      )
                    }
                    placeholder={tr(
                      "e.g. Mobile Phone, Wallet, Watch",
                      "उदा. मोबाईल, पाकीट, घड्याळ"
                    )}
                    disabled={
                      saving
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",
                    }}
                  />

                </div>


                {/* DESCRIPTION */}

                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Description",
                      "वर्णन"
                    )}
                  </label>


                  <textarea
                    value={
                      itemDescription
                    }
                    onChange={(
                      event
                    ) =>
                      setItemDescription(
                        event.target
                          .value
                      )
                    }
                    placeholder={tr(
                      "Describe colour, brand, identifying marks, etc.",
                      "रंग, ब्रँड, ओळखण्याची खूण इत्यादी लिहा."
                    )}
                    disabled={
                      saving
                    }
                    rows={
                      3
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",

                      resize:
                        "vertical",
                    }}
                  />

                </div>


                {/* ROOM */}

                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Room",
                      "खोली"
                    )}{" "}

                    <span
                      style={{
                        color:
                          "#dc2626",
                      }}
                    >
                      *
                    </span>

                  </label>


                  <select
                    value={
                      selectedRoomId
                    }
                    onChange={(
                      event
                    ) =>
                      handleRoomChange(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      saving
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",

                      background:
                        "#ffffff",
                    }}
                  >

                    <option value="">
                      {tr(
                        "Select room",
                        "खोली निवडा"
                      )}
                    </option>


                    {rooms.map(
                      (
                        room
                      ) => (

                        <option
                          key={
                            room.id
                          }
                          value={
                            room.id
                          }
                        >
                          {
                            room.room_number
                          }
                        </option>

                      )
                    )}

                  </select>


                  {rooms.length ===
                    0 && (

                    <div
                      style={{
                        marginTop:
                          "7px",

                        color:
                          "#94a3b8",

                        fontSize:
                          "12px",
                      }}
                    >
                      {tr(
                        "No rooms available for this user.",
                        "या वापरकर्त्यासाठी कोणत्याही खोल्या उपलब्ध नाहीत."
                      )}
                    </div>

                  )}

                </div>


                {/* GUEST */}

                {selectedRoomId && (

                  <div
                    style={{
                      padding:
                        "16px",

                      border:
                        "1px solid #dbeafe",

                      background:
                        "#eff6ff",

                      borderRadius:
                        "12px",
                    }}
                  >

                    <label
                      style={{
                        display:
                          "block",

                        marginBottom:
                          "7px",

                        color:
                          "#1e3a8a",

                        fontSize:
                          "13px",

                        fontWeight:
                          800,
                      }}
                    >
                      {tr(
                        "Guest / Booking",
                        "अतिथी / बुकिंग"
                      )}
                    </label>


                    {loadingRoomGuests ? (

                      <div
                        style={{
                          color:
                            "#64748b",

                          fontSize:
                            "13px",

                          padding:
                            "8px 0",
                        }}
                      >
                        {tr(
                          "Loading room guests...",
                          "खोलीतील अतिथी लोड होत आहेत..."
                        )}
                      </div>

                    ) : roomGuests.length ===
                      0 ? (

                      <div
                        style={{
                          color:
                            "#64748b",

                          fontSize:
                            "13px",

                          padding:
                            "8px 0",
                        }}
                      >
                        {tr(
                          "No previous/current booking guest was found for this room.",
                          "या खोलीसाठी पूर्वीचा किंवा सध्याचा बुकिंग अतिथी आढळला नाही."
                        )}
                      </div>

                    ) : (

                      <>

                        <select
                          value={
                            selectedGuestId
                          }
                          onChange={(
                            event
                          ) =>
                            handleGuestChange(
                              event
                                .target
                                .value
                            )
                          }
                          disabled={
                            saving
                          }
                          style={{
                            width:
                              "100%",

                            boxSizing:
                              "border-box",

                            border:
                              "1px solid #93c5fd",

                            borderRadius:
                              "10px",

                            padding:
                              "11px 13px",

                            fontSize:
                              "14px",

                            background:
                              "#ffffff",
                          }}
                        >

                          <option value="">
                            {tr(
                              "Select guest",
                              "अतिथी निवडा"
                            )}
                          </option>


                          {roomGuests.map(
                            (
                              guest
                            ) => (

                              <option
                                key={`${guest.booking_id}-${guest.guest_id}`}
                                value={
                                  guest.guest_id
                                }
                              >
                                {
                                  guest.guest_name
                                }{" "}
                                —{" "}
                                {
                                  guest.booking_reference
                                }
                              </option>

                            )
                          )}

                        </select>


                        {selectedGuest && (

                          <div
                            style={{
                              marginTop:
                                "12px",

                              display:
                                "grid",

                              gridTemplateColumns:
                                "1fr 1fr",

                              gap:
                                "10px",
                            }}
                          >

                            <div
                              style={{
                                background:
                                  "#ffffff",

                                border:
                                  "1px solid #dbeafe",

                                borderRadius:
                                  "9px",

                                padding:
                                  "10px",
                              }}
                            >

                              <div
                                style={{
                                  fontSize:
                                    "11px",

                                  color:
                                    "#64748b",

                                  fontWeight:
                                    700,
                                }}
                              >
                                {tr(
                                  "Guest",
                                  "अतिथी"
                                )}
                              </div>


                              <div
                                style={{
                                  marginTop:
                                    "3px",

                                  color:
                                    "#0f172a",

                                  fontWeight:
                                    800,
                                }}
                              >
                                {
                                  selectedGuest.guest_name
                                }
                              </div>

                            </div>


                            <div
                              style={{
                                background:
                                  "#ffffff",

                                border:
                                  "1px solid #dbeafe",

                                borderRadius:
                                  "9px",

                                padding:
                                  "10px",
                              }}
                            >

                              <div
                                style={{
                                  fontSize:
                                    "11px",

                                  color:
                                    "#64748b",

                                  fontWeight:
                                    700,
                                }}
                              >
                                {tr(
                                  "Booking Reference",
                                  "बुकिंग संदर्भ"
                                )}
                              </div>


                              <div
                                style={{
                                  marginTop:
                                    "3px",

                                  color:
                                    "#0f172a",

                                  fontWeight:
                                    800,
                                }}
                              >
                                {
                                  selectedGuest.booking_reference
                                }
                              </div>

                            </div>

                          </div>

                        )}

                      </>

                    )}

                  </div>

                )}


                {/* DATE + FOUND BY */}

                <div
                  style={{
                    display:
                      "grid",

                    gridTemplateColumns:
                      "1fr 1fr",

                    gap:
                      "14px",
                  }}
                >

                  <div>

                    <label
                      style={{
                        display:
                          "block",

                        marginBottom:
                          "7px",

                        color:
                          "#334155",

                        fontSize:
                          "13px",

                        fontWeight:
                          800,
                      }}
                    >
                      {tr(
                        "Found Date",
                        "सापडल्याची तारीख"
                      )}
                    </label>


                    <input
                      type="date"
                      value={
                        foundDate
                      }
                      onChange={(
                        event
                      ) =>
                        setFoundDate(
                          event.target
                            .value
                        )
                      }
                      disabled={
                        saving
                      }
                      style={{
                        width:
                          "100%",

                        boxSizing:
                          "border-box",

                        border:
                          "1px solid #cbd5e1",

                        borderRadius:
                          "10px",

                        padding:
                          "11px 13px",

                        fontSize:
                          "14px",
                      }}
                    />

                  </div>


                  <div>

                    <label
                      style={{
                        display:
                          "block",

                        marginBottom:
                          "7px",

                        color:
                          "#334155",

                        fontSize:
                          "13px",

                        fontWeight:
                          800,
                      }}
                    >
                      {tr(
                        "Found By",
                        "सापडवणारे"
                      )}
                    </label>


                    <input
                      type="text"
                      value={
                        foundBy
                      }
                      onChange={(
                        event
                      ) =>
                        setFoundBy(
                          event.target
                            .value
                        )
                      }
                      placeholder={tr(
                        "e.g. Housekeeping Staff",
                        "उदा. हाऊसकीपिंग कर्मचारी"
                      )}
                      disabled={
                        saving
                      }
                      style={{
                        width:
                          "100%",

                        boxSizing:
                          "border-box",

                        border:
                          "1px solid #cbd5e1",

                        borderRadius:
                          "10px",

                        padding:
                          "11px 13px",

                        fontSize:
                          "14px",
                      }}
                    />

                  </div>

                </div>


                {/* RECEIVED BY */}

                <div
                  style={{
                    background:
                      "#f8fafc",

                    border:
                      "1px solid #e2e8f0",

                    borderRadius:
                      "10px",

                    padding:
                      "12px 14px",

                    fontSize:
                      "13px",

                    color:
                      "#475569",
                  }}
                >

                  <strong>
                    {tr(
                      "Received by:",
                      "वस्तू स्वीकारणारे:"
                    )}
                  </strong>{" "}

                  {user.full_name || user.username || user.id}

                </div>

              </div>


              {/* FOOTER */}

              <div
                style={{
                  padding:
                    "16px 24px",

                  borderTop:
                    "1px solid #e2e8f0",

                  display:
                    "flex",

                  justifyContent:
                    "flex-end",

                  gap:
                    "10px",
                }}
              >

                <button
                  type="button"
                  onClick={
                    closeAddModal
                  }
                  disabled={
                    saving
                  }
                  style={{
                    border:
                      "1px solid #cbd5e1",

                    background:
                      "#ffffff",

                    color:
                      "#334155",

                    borderRadius:
                      "10px",

                    padding:
                      "10px 17px",

                    cursor:
                      saving
                        ? "not-allowed"
                        : "pointer",

                    fontWeight:
                      800,
                  }}
                >
                  {tr(
                    "Cancel",
                    "रद्द करा"
                  )}
                </button>


                <button
                  type="submit"
                  disabled={
                    saving
                  }
                  style={{
                    border:
                      "none",

                    background:
                      saving
                        ? "#94a3b8"
                        : "linear-gradient(135deg, #f97316, #ea580c)",

                    color:
                      "#ffffff",

                    borderRadius:
                      "10px",

                    padding:
                      "10px 19px",

                    cursor:
                      saving
                        ? "not-allowed"
                        : "pointer",

                    fontWeight:
                      800,
                  }}
                >
                  {saving
                    ? tr(
                        "Saving...",
                        "जतन होत आहे..."
                      )
                    : tr(
                        "Save Item",
                        "वस्तू जतन करा"
                      )}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {/* ===================================================
          RETURN MODAL
          =================================================== */}

      {returnItem && (

        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            background:
              "rgba(15,23,42,0.55)",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            padding:
              "20px",

            zIndex:
              1000,
          }}
        >

          <div
            style={{
              width:
                "100%",

              maxWidth:
                "520px",

              background:
                "#ffffff",

              borderRadius:
                "20px",

              boxShadow:
                "0 25px 70px rgba(15,23,42,0.25)",
            }}
          >

            <div
              style={{
                padding:
                  "22px 24px",

                borderBottom:
                  "1px solid #e2e8f0",
              }}
            >

              <h2
                style={{
                  margin:
                    0,

                  color:
                    "#0f172a",

                  fontSize:
                    "21px",

                  fontWeight:
                    850,
                }}
              >
                {tr(
                  "Mark Item as Returned",
                  "वस्तू परत केल्याची नोंद"
                )}
              </h2>


              <p
                style={{
                  margin:
                    "6px 0 0",

                  color:
                    "#64748b",

                  fontSize:
                    "13px",
                }}
              >
                {
                  returnItem.item_name
                }
              </p>

            </div>


            <form
              onSubmit={
                handleReturnItem
              }
            >

              <div
                style={{
                  padding:
                    "24px",

                  display:
                    "grid",

                  gap:
                    "16px",
                }}
              >

                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Returned To",
                      "कोणाला परत केले"
                    )}{" "}

                    <span
                      style={{
                        color:
                          "#dc2626",
                      }}
                    >
                      *
                    </span>

                  </label>


                  <input
                    type="text"
                    value={
                      returnedTo
                    }
                    onChange={(
                      event
                    ) =>
                      setReturnedTo(
                        event.target
                          .value
                      )
                    }
                    placeholder={tr(
                      "Guest name / recipient",
                      "अतिथीचे नाव / स्वीकारणारा"
                    )}
                    disabled={
                      returning
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",
                    }}
                  />

                </div>


                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Return Date",
                      "परत केल्याची तारीख"
                    )}
                  </label>


                  <input
                    type="date"
                    value={
                      returnedDate
                    }
                    onChange={(
                      event
                    ) =>
                      setReturnedDate(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      returning
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",
                    }}
                  />

                </div>


                <div>

                  <label
                    style={{
                      display:
                        "block",

                      marginBottom:
                        "7px",

                      color:
                        "#334155",

                      fontSize:
                        "13px",

                      fontWeight:
                        800,
                    }}
                  >
                    {tr(
                      "Remarks",
                      "शेरा"
                    )}
                  </label>


                  <textarea
                    value={
                      returnRemarks
                    }
                    onChange={(
                      event
                    ) =>
                      setReturnRemarks(
                        event.target
                          .value
                      )
                    }
                    rows={
                      3
                    }
                    placeholder={tr(
                      "Optional return remarks",
                      "परत करण्याबाबत शेरा"
                    )}
                    disabled={
                      returning
                    }
                    style={{
                      width:
                        "100%",

                      boxSizing:
                        "border-box",

                      border:
                        "1px solid #cbd5e1",

                      borderRadius:
                        "10px",

                      padding:
                        "11px 13px",

                      fontSize:
                        "14px",

                      resize:
                        "vertical",
                    }}
                  />

                </div>

              </div>


              <div
                style={{
                  padding:
                    "16px 24px",

                  borderTop:
                    "1px solid #e2e8f0",

                  display:
                    "flex",

                  justifyContent:
                    "flex-end",

                  gap:
                    "10px",
                }}
              >

                <button
                  type="button"
                  onClick={
                    closeReturnModal
                  }
                  disabled={
                    returning
                  }
                  style={{
                    border:
                      "1px solid #cbd5e1",

                    background:
                      "#ffffff",

                    color:
                      "#334155",

                    borderRadius:
                      "10px",

                    padding:
                      "10px 17px",

                    cursor:
                      returning
                        ? "not-allowed"
                        : "pointer",

                    fontWeight:
                      800,
                  }}
                >
                  {tr(
                    "Cancel",
                    "रद्द करा"
                  )}
                </button>


                <button
                  type="submit"
                  disabled={
                    returning
                  }
                  style={{
                    border:
                      "none",

                    background:
                      returning
                        ? "#94a3b8"
                        : "#16a34a",

                    color:
                      "#ffffff",

                    borderRadius:
                      "10px",

                    padding:
                      "10px 17px",

                    cursor:
                      returning
                        ? "not-allowed"
                        : "pointer",

                    fontWeight:
                      800,
                  }}
                >
                  {returning
                    ? tr(
                        "Saving...",
                        "जतन होत आहे..."
                      )
                    : tr(
                        "Confirm Return",
                        "परत केल्याची पुष्टी"
                      )}
                </button>

              </div>

            </form>

          </div>

        </div>

      )}


      {/* ===================================================
          VIEW MODAL
          =================================================== */}

      {viewItem && (

        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            background:
              "rgba(15,23,42,0.55)",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            padding:
              "20px",

            zIndex:
              1000,
          }}
        >

          <div
            style={{
              width:
                "100%",

              maxWidth:
                "620px",

              background:
                "#ffffff",

              borderRadius:
                "20px",

              boxShadow:
                "0 25px 70px rgba(15,23,42,0.25)",

              overflow:
                "hidden",
            }}
          >

            <div
              style={{
                padding:
                  "22px 24px",

                borderBottom:
                  "1px solid #e2e8f0",

                display:
                  "flex",

                justifyContent:
                  "space-between",

                alignItems:
                  "center",
              }}
            >

              <h2
                style={{
                  margin:
                    0,

                  color:
                    "#0f172a",

                  fontSize:
                    "21px",

                  fontWeight:
                    850,
                }}
              >
                {tr(
                  "Lost & Found Details",
                  "हरवलेल्या व सापडलेल्या वस्तूचे तपशील"
                )}
              </h2>


              <button
                type="button"
                onClick={() =>
                  setViewItem(
                    null
                  )
                }
                style={{
                  width:
                    "36px",

                  height:
                    "36px",

                  border:
                    "1px solid #e2e8f0",

                  borderRadius:
                    "10px",

                  background:
                    "#ffffff",

                  color:
                    "#64748b",

                  cursor:
                    "pointer",

                  fontSize:
                    "18px",
                }}
              >
                ×
              </button>

            </div>


            <div
              style={{
                padding:
                  "24px",

                display:
                  "grid",

                gap:
                  "13px",
              }}
            >

              {[
                [
                  tr(
                    "Item",
                    "वस्तू"
                  ),
                  viewItem.item_name,
                ],

                [
                  tr(
                    "Description",
                    "वर्णन"
                  ),
                  viewItem.item_description ||
                    "-",
                ],

                [
                  tr(
                    "Room",
                    "खोली"
                  ),
                  viewItem.room_number ||
                    "-",
                ],

                [
                  tr(
                    "Guest",
                    "अतिथी"
                  ),
                  viewItem.guest_name ||
                    "-",
                ],

                [
                  tr(
                    "Booking",
                    "बुकिंग"
                  ),
                  viewItem.booking_reference ||
                    "-",
                ],

                [
                  tr(
                    "Found Date",
                    "सापडल्याची तारीख"
                  ),
                  formatDate(
                    viewItem.found_date
                  ),
                ],

                [
                  tr(
                    "Found By",
                    "सापडवणारे"
                  ),
                  viewItem.found_by ||
                    "-",
                ],

                [
                  tr(
                    "Returned Date",
                    "परत केल्याची तारीख"
                  ),
                  formatDate(
                    viewItem.returned_date
                  ),
                ],

                [
                  tr(
                    "Returned To",
                    "कोणाला परत केले"
                  ),
                  viewItem.returned_to ||
                    "-",
                ],

                [
                  tr(
                    "Return Remarks",
                    "परत करण्याचा शेरा"
                  ),
                  viewItem.return_remarks ||
                    "-",
                ],
              ].map(
                (
                  row,
                  index
                ) => (

                  <div
                    key={
                      index
                    }
                    style={{
                      display:
                        "grid",

                      gridTemplateColumns:
                        "180px 1fr",

                      gap:
                        "16px",

                      padding:
                        "11px 0",

                      borderBottom:
                        index ===
                        9
                          ? "none"
                          : "1px solid #f1f5f9",
                    }}
                  >

                    <div
                      style={{
                        color:
                          "#64748b",

                        fontSize:
                          "13px",

                        fontWeight:
                          800,
                      }}
                    >
                      {
                        row[0]
                      }
                    </div>


                    <div
                      style={{
                        color:
                          "#334155",

                        fontSize:
                          "14px",

                        fontWeight:
                          600,
                      }}
                    >
                      {
                        row[1]
                      }
                    </div>

                  </div>

                )
              )}

            </div>


            <div
              style={{
                padding:
                  "16px 24px",

                borderTop:
                  "1px solid #e2e8f0",

                display:
                  "flex",

                justifyContent:
                  "flex-end",
              }}
            >

              <button
                type="button"
                onClick={() =>
                  setViewItem(
                    null
                  )
                }
                style={{
                  border:
                    "1px solid #cbd5e1",

                  background:
                    "#ffffff",

                  color:
                    "#334155",

                  borderRadius:
                    "10px",

                  padding:
                    "10px 18px",

                  cursor:
                    "pointer",

                  fontWeight:
                    800,
                }}
              >
                {tr(
                  "Close",
                  "बंद करा"
                )}
              </button>

            </div>

          </div>

        </div>

      )}


      {/* ===================================================
          MESSAGE MODAL
          =================================================== */}

      {messageModal && (

        <div
          style={{
            position:
              "fixed",

            inset:
              0,

            background:
              "rgba(15,23,42,0.48)",

            display:
              "flex",

            alignItems:
              "center",

            justifyContent:
              "center",

            padding:
              "20px",

            zIndex:
              2000,
          }}
        >

          <div
            style={{
              width:
                "100%",

              maxWidth:
                "430px",

              background:
                "#ffffff",

              borderRadius:
                "18px",

              padding:
                "24px",

              boxShadow:
                "0 25px 70px rgba(15,23,42,0.25)",
            }}
          >

            <h3
              style={{
                margin:
                  "0 0 9px",

                color:
                  "#0f172a",

                fontSize:
                  "19px",

                fontWeight:
                  850,
              }}
            >
              {
                messageModal.title
              }
            </h3>


            <p
              style={{
                margin:
                  "0 0 22px",

                color:
                  "#64748b",

                lineHeight:
                  1.6,

                fontSize:
                  "14px",
              }}
            >
              {
                messageModal.message
              }
            </p>


            <div
              style={{
                display:
                  "flex",

                justifyContent:
                  "flex-end",
              }}
            >

              <button
                type="button"
                onClick={() =>
                  setMessageModal(
                    null
                  )
                }
                style={{
                  border:
                    "none",

                  background:
                    "#0f172a",

                  color:
                    "#ffffff",

                  borderRadius:
                    "10px",

                  padding:
                    "10px 20px",

                  cursor:
                    "pointer",

                  fontWeight:
                    800,
                }}
              >
                {tr(
                  "OK",
                  "ठीक आहे"
                )}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};


export default LostAndFound;