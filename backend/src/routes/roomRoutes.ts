import { Router } from "express";
import { pool } from "../config/db.js";

const router = Router();

interface RequestedDateRange {
  checkIn: string | null;
  checkOut: string | null;
}

const readRequestedDateRange = (
  req: {
    query: Record<string, unknown>;
  }
): RequestedDateRange | null => {
  const checkInValue =
    req.query.check_in_date;
  const checkOutValue =
    req.query.expected_check_out_date;

  if (
    checkInValue === undefined &&
    checkOutValue === undefined
  ) {
    return {
      checkIn: null,
      checkOut: null,
    };
  }

  const checkIn =
    typeof checkInValue === "string"
      ? checkInValue
      : "";
  const checkOut =
    typeof checkOutValue === "string"
      ? checkOutValue
      : "";
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(
      Date.parse(`${value}T00:00:00.000Z`)
    ) &&
    new Date(`${value}T00:00:00.000Z`)
      .toISOString()
      .startsWith(value);

  if (
    !validDate(checkIn) ||
    !validDate(checkOut) ||
    checkOut < checkIn
  ) {
    return null;
  }

  return {
    checkIn,
    checkOut,
  };
};

router.get("/rate-card", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can view rate cards.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        r.id,
        r.room_number,
        r.total_beds,
        r.is_bookable,
        r.gender_restriction,
        r.room_note,
        rc.category_name,
        r.is_under_maintenance,
        card.room_capacity,
        card.bed_capacity,
        card.esm_room_rate,
        card.serving_room_rate,
        card.civilian_room_rate
      FROM rooms r
      INNER JOIN room_categories rc
        ON rc.id = r.category_id
      LEFT JOIN room_rate_cards card
        ON card.room_id = r.id
      WHERE
        r.is_active = TRUE
      ORDER BY rc.category_name, r.room_number
      `
    );

    return res.json({ success: true, rooms: result.rows });
  } catch (error) {
    console.error("Room rate-card fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch room rates.",
    });
  }
});

router.get("/delayed-checkout-rates", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can view delayed check-out rates.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT rate_category, hourly_rate
      FROM delayed_checkout_rate_cards
      ORDER BY CASE rate_category
        WHEN 'AC' THEN 1
        WHEN 'NAC' THEN 2
        WHEN 'DM_BED' THEN 3
        WHEN 'VIP' THEN 4
      END
      `
    );
    const rates = Object.fromEntries(
      result.rows.map(
        (row: { rate_category: string; hourly_rate: string | number }) => [
          row.rate_category,
          Number(row.hourly_rate),
        ]
      )
    );
    for (const category of ["AC", "NAC", "DM_BED", "VIP"]) {
      if (!Number.isFinite(rates[category])) {
        throw new Error(
          `Delayed check-out rate for ${category} is missing or invalid.`
        );
      }
    }
    return res.json({ success: true, rates });
  } catch (error) {
    console.error("Delayed check-out rate fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch delayed check-out rates.",
    });
  }
});

router.put("/delayed-checkout-rates", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can update delayed check-out rates.",
    });
  }

  const categories = ["AC", "NAC", "DM_BED", "VIP"] as const;
  const rates = req.body?.rates;
  const parseRate = (value: unknown): number | null => {
    if (typeof value !== "number" && typeof value !== "string") {
      return null;
    }
    const rate = Number(value);
    return Number.isFinite(rate) &&
      rate >= 0 &&
      rate <= 9_999_999_999.99
      ? rate
      : null;
  };

  if (
    typeof rates !== "object" ||
    rates === null ||
    Array.isArray(rates) ||
    categories.some((category) =>
      parseRate(Reflect.get(rates, category)) === null
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Valid non-negative hourly rates are required for AC, NAC, DM/Hall beds and VIP.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const category of categories) {
      await client.query(
        `
        INSERT INTO delayed_checkout_rate_cards (
          rate_category, hourly_rate, updated_by, updated_at
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (rate_category)
        DO UPDATE SET
          hourly_rate = EXCLUDED.hourly_rate,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [category, parseRate(Reflect.get(rates, category)), req.authUser!.id]
      );
    }

    await client.query("COMMIT");
    return res.json({
      success: true,
      message: "Shared delayed check-out rates saved.",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delayed check-out rate update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to save delayed check-out rates.",
    });
  } finally {
    client.release();
  }
});

router.get("/capacities", async (req, res) => {
  const roleName = req.authUser?.role;
  if (!roleName) {
    return res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        r.id AS room_id,
        card.room_capacity,
        card.bed_capacity,
        card.esm_room_rate,
        card.serving_room_rate,
        card.civilian_room_rate
      FROM rooms r
      LEFT JOIN room_rate_cards card
        ON card.room_id = r.id
      WHERE
        r.is_active = TRUE
        AND r.is_bookable = TRUE
        AND (
          $1 = 'ADMIN'
          OR EXISTS (
            SELECT 1
            FROM room_permissions rp
            WHERE rp.room_id = r.id
              AND rp.role_name = $1
              AND (rp.can_book = TRUE OR rp.can_allot = TRUE)
          )
        )
      `,
      [roleName]
    );

    return res.json({ success: true, capacities: result.rows });
  } catch (error) {
    console.error("Room capacity fetch error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch room capacity settings.",
    });
  }
});

router.put("/rate-card/category/dormitory", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can update room rates.",
    });
  }

  const parseRate = (value: unknown, field: string): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`Invalid value for ${field}.`);
    }
    return rate;
  };

  let esmRate: number | null;
  let servingRate: number | null;
  let civilianRate: number | null;
  try {
    esmRate = parseRate(
      req.body.esm_room_rate,
      "esm_room_rate"
    );
    servingRate = parseRate(
      req.body.serving_room_rate,
      "serving_room_rate"
    );
    civilianRate = parseRate(
      req.body.civilian_room_rate,
      "civilian_room_rate"
    );
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : "Invalid room rate.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomsResult = await client.query(
      `
      SELECT r.id
      FROM rooms r
      INNER JOIN room_categories rc ON rc.id = r.category_id
      WHERE r.is_active = TRUE
        AND r.is_bookable = TRUE
        AND (
          UPPER(REPLACE(REPLACE(TRIM(rc.category_name), '-', '_'), ' ', '_'))
              IN ('DORMITORY', 'DM')
          OR UPPER(rc.category_name) LIKE '%DORMITORY%'
          OR UPPER(TRIM(r.room_number)) LIKE 'DM%'
        )
      ORDER BY r.id
      FOR UPDATE OF r
      `
    );

    if (roomsResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "No active DM rooms were found.",
      });
    }

    const updateResult = await client.query(
      `
      INSERT INTO room_rate_cards (
        room_id,
        esm_room_rate,
        serving_room_rate,
        civilian_room_rate,
        updated_by,
        updated_at
      )
      SELECT
        r.id,
        $1,
        $2,
        $3,
        $4,
        CURRENT_TIMESTAMP
      FROM rooms r
      INNER JOIN room_categories rc ON rc.id = r.category_id
      WHERE r.is_active = TRUE
        AND r.is_bookable = TRUE
        AND (
          UPPER(REPLACE(REPLACE(TRIM(rc.category_name), '-', '_'), ' ', '_'))
              IN ('DORMITORY', 'DM')
          OR UPPER(rc.category_name) LIKE '%DORMITORY%'
          OR UPPER(TRIM(r.room_number)) LIKE 'DM%'
        )
      ON CONFLICT (room_id)
      DO UPDATE SET
        esm_room_rate = EXCLUDED.esm_room_rate,
        serving_room_rate = EXCLUDED.serving_room_rate,
        civilian_room_rate = EXCLUDED.civilian_room_rate,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      `,
      [esmRate, servingRate, civilianRate, req.authUser.id]
    );

    await client.query("COMMIT");
    return res.json({
      success: true,
      updatedRooms: updateResult.rowCount ?? roomsResult.rowCount ?? 0,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("DM room rate update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update the shared DM room rates.",
    });
  } finally {
    client.release();
  }
});

router.put("/:roomId", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can update room details.",
    });
  }

  const { roomId } = req.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid room ID is required.",
    });
  }

  const rawRoomNumber = typeof req.body?.room_number === "string"
    ? req.body.room_number.trim()
    : "";
  const rawCategoryName = typeof req.body?.category_name === "string"
    ? req.body.category_name.trim()
    : "";

  if (!rawRoomNumber) {
    return res.status(400).json({
      success: false,
      message: "Room number is required.",
    });
  }

  const roomCategoryMap: Record<string, string> = {
    AC: "AC",
    NAC: "NAC",
    NON_AC: "NAC",
    "NON-AC": "NAC",
    DM: "DM",
    DORMITORY: "DM",
    VIP: "VIP",
    HALL: "HALL",
    OTHER: "OTHER",
    "AC_VIP": "VIP",
    "ACVIP": "VIP",
  };

  const normalizedCategory =
    roomCategoryMap[rawCategoryName.toUpperCase()] ??
    roomCategoryMap[
      rawCategoryName
        .replace(/[-\s]+/g, "_")
        .replace(/\./g, "")
        .toUpperCase()
    ] ??
    "OTHER";

  const bedCapacityValue = req.body?.bed_capacity;
  const bedCapacity =
    bedCapacityValue === undefined || bedCapacityValue === null || bedCapacityValue === ""
      ? null
      : Number(bedCapacityValue);

  if (
    bedCapacity !== null &&
    (!Number.isInteger(bedCapacity) || bedCapacity < 0)
  ) {
    return res.status(400).json({
      success: false,
      message: "Bed capacity must be a non-negative integer.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      SELECT id, room_number, category_id
      FROM rooms
      WHERE id = $1 AND is_active = TRUE
      FOR UPDATE
      `,
      [roomId]
    );

    if (roomResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    const existingCategory = await client.query(
      `
      SELECT id, category_name
      FROM room_categories
      WHERE category_name = $1
      LIMIT 1
      `,
      [normalizedCategory]
    );

    const categoryResult = existingCategory.rowCount
      ? existingCategory
      : await client.query(
          `
          INSERT INTO room_categories (category_name, created_at)
          VALUES ($1, CURRENT_TIMESTAMP)
          RETURNING id, category_name
          `,
          [normalizedCategory]
        );

    const categoryId = categoryResult.rows[0].id;

    const updatedRoom = await client.query(
      `
      UPDATE rooms
      SET room_number = $2, category_id = $3
      WHERE id = $1
      RETURNING id, room_number, category_id
      `,
      [roomId, rawRoomNumber, categoryId]
    );

    if (bedCapacity !== null) {
      await client.query(
        `
        INSERT INTO room_rate_cards (
          room_id,
          bed_capacity,
          updated_by,
          updated_at
        )
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        ON CONFLICT (room_id)
        DO UPDATE SET
          bed_capacity = EXCLUDED.bed_capacity,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
        `,
        [roomId, bedCapacity, req.authUser!.id]
      );
    }

    await client.query("COMMIT");
    return res.json({
      success: true,
      room: updatedRoom.rows[0],
      category: categoryResult.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Room details update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update room details.",
    });
  } finally {
    client.release();
  }
});

router.put("/:roomId/maintenance", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can change room maintenance status.",
    });
  }

  const { roomId } = req.params;
  const isUnderMaintenance = req.body?.is_under_maintenance;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    ) ||
    typeof isUnderMaintenance !== "boolean"
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid room ID and maintenance status are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomResult = await client.query(
      `
      SELECT id, room_number
      FROM rooms
      WHERE id = $1 AND is_active = TRUE
      FOR UPDATE
      `,
      [roomId]
    );
    if (roomResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    if (isUnderMaintenance) {
      const conflictingBooking = await client.query(
        `
        SELECT 1
        FROM booking_acceptances ba
        INNER JOIN bookings b ON b.id = ba.booking_id
        WHERE ba.room_id = $1
          AND ba.acceptance_status = 'ACCEPTED'
          AND b.expected_check_out_date >= CURRENT_DATE
        UNION ALL
        SELECT 1
        FROM allotments a
        INNER JOIN bookings b ON b.id = a.booking_id
        WHERE a.room_id = $1
          AND a.allotment_status = 'ALLOTTED'
          AND b.expected_check_out_date >= CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1 FROM check_outs co
            WHERE co.allotment_id = a.id
          )
        LIMIT 1
        `,
        [roomId]
      );
      if ((conflictingBooking.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "This room has an accepted or active booking that has not checked out. It cannot be placed under maintenance yet.",
        });
      }
    }

    const updatedRoom = await client.query(
      `
      UPDATE rooms
      SET is_under_maintenance = $2
      WHERE id = $1
      RETURNING id, room_number, is_under_maintenance
      `,
      [roomId, isUnderMaintenance]
    );
    await client.query("COMMIT");
    return res.json({
      success: true,
      room: updatedRoom.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Room maintenance status update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update room maintenance status.",
    });
  } finally {
    client.release();
  }
});

router.put("/:roomId/identity", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can change room category or room number.",
    });
  }

  const { roomId } = req.params;
  const roomNumber =
    typeof req.body?.room_number === "string"
      ? req.body.room_number.trim()
      : "";
  const requestedCategory =
    typeof req.body?.category === "string"
      ? req.body.category.trim().toUpperCase()
      : "";
  const allowedCategories = ["AC", "NON_AC", "DORMITORY"];
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    ) ||
    roomNumber.length < 1 ||
    roomNumber.length > 50 ||
    !allowedCategories.includes(requestedCategory)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "A valid room ID, room number (1–50 characters), and category (AC, NON_AC or DORMITORY) are required.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomResult = await client.query(
      `
      SELECT r.id, r.room_number, r.category_id, r.is_under_maintenance
      FROM rooms r
      WHERE r.id = $1 AND r.is_active = TRUE
      FOR UPDATE OF r
      `,
      [roomId]
    );
    if (roomResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    const room = roomResult.rows[0];
    const conflictingUse = await client.query(
      `
      SELECT 1
      FROM booking_acceptances ba
      INNER JOIN bookings b ON b.id = ba.booking_id
      WHERE ba.room_id = $1
        AND ba.acceptance_status = 'ACCEPTED'
        AND b.expected_check_out_date >= CURRENT_DATE

      UNION ALL

      SELECT 1
      FROM allotments a
      WHERE a.room_id = $1
        AND a.allotment_status = 'ALLOTTED'
        AND NOT EXISTS (
          SELECT 1
          FROM check_outs co
          WHERE co.allotment_id = a.id
        )

      UNION ALL

      SELECT 1
      FROM beds bed
      WHERE bed.room_id = $1
        AND UPPER(bed.bed_status) IN (
          'BOOKED',
          'RESERVED',
          'OCCUPIED',
          'CLEANING',
          'NEEDS_CLEANING'
        )

      UNION ALL

      SELECT 1
      FROM housekeeping_tasks ht
      WHERE ht.room_id = $1
        AND UPPER(REPLACE(ht.task_status, ' ', '_')) <> 'CLEARED'
      LIMIT 1
      `,
      [roomId]
    );
    if ((conflictingUse.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "Room category or number cannot be changed while it has an active/future booking, allotment, occupied/uncleared bed, or unfinished housekeeping task.",
      });
    }

    const duplicateRoom = await client.query(
      `
      SELECT 1
      FROM rooms
      WHERE UPPER(TRIM(room_number)) = UPPER(TRIM($1))
        AND id <> $2
      LIMIT 1
      `,
      [roomNumber, roomId]
    );
    if ((duplicateRoom.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "That room number is already in use.",
      });
    }

    const categoryResult = await client.query(
      `
      SELECT id, category_name
      FROM room_categories
      WHERE CASE $1::TEXT
        WHEN 'AC' THEN UPPER(TRIM(category_name)) = 'AC'
        WHEN 'NON_AC' THEN
          UPPER(REPLACE(REPLACE(TRIM(category_name), '-', '_'), ' ', '_'))
            IN ('NON_AC', 'NAC')
        WHEN 'DORMITORY' THEN
          UPPER(REPLACE(REPLACE(TRIM(category_name), '-', '_'), ' ', '_'))
            IN ('DORMITORY', 'DM')
      END
      ORDER BY
        CASE
          WHEN UPPER(TRIM(category_name)) = $1 THEN 0
          ELSE 1
        END
      LIMIT 1
      `,
      [requestedCategory]
    );
    if (categoryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "The selected room category is not configured.",
      });
    }

    if (requestedCategory === "DORMITORY") {
      const bedsResult = await client.query(
        "SELECT COUNT(*)::INTEGER AS bed_count FROM beds WHERE room_id = $1 AND is_active = TRUE",
        [roomId]
      );
      if (Number(bedsResult.rows[0].bed_count) === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "This room cannot be changed to DM/Dormitory because it has no active beds configured.",
        });
      }
    }

    const updatedRoom = await client.query(
      `
      UPDATE rooms
      SET
        room_number = $2,
        category_id = $3,
        gender_restriction = CASE
          WHEN $4 = 'DORMITORY' THEN gender_restriction
          ELSE 'ANY'
        END
      WHERE id = $1
      RETURNING id, room_number
      `,
      [
        roomId,
        roomNumber,
        categoryResult.rows[0].id,
        requestedCategory,
      ]
    );
    await client.query("COMMIT");
    return res.json({
      success: true,
      room: {
        ...updatedRoom.rows[0],
        category_name: categoryResult.rows[0].category_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Room identity update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update room category or number.",
    });
  } finally {
    client.release();
  }
});

router.put("/:roomId/customization", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can customize room inventory.",
    });
  }

  const { roomId } = req.params;
  const roomNumber =
    typeof req.body?.room_number === "string"
      ? req.body.room_number.trim()
      : "";
  const category =
    typeof req.body?.category === "string"
      ? req.body.category.trim().toUpperCase()
      : "";
  const totalBeds = Number(req.body?.total_beds);
  const genderRestriction =
    typeof req.body?.gender_restriction === "string"
      ? req.body.gender_restriction.trim().toUpperCase()
      : "";
  const isBookable = req.body?.is_bookable;
  const roomNote =
    typeof req.body?.room_note === "string"
      ? req.body.room_note.trim() || null
      : null;
  const allowedCategories = ["AC", "NON_AC", "DORMITORY", "VIP", "HALL"];

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    ) ||
    roomNumber.length < 1 ||
    roomNumber.length > 50 ||
    !allowedCategories.includes(category) ||
    !Number.isInteger(totalBeds) ||
    totalBeds < 0 ||
    !["ANY", "MALE", "FEMALE"].includes(genderRestriction) ||
    typeof isBookable !== "boolean" ||
    (roomNote !== null && roomNote.length > 120)
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Provide a valid room number, category, non-negative whole bed count, gender restriction, booking status, and room note (maximum 120 characters).",
    });
  }

  if (isBookable && totalBeds === 0) {
    return res.status(400).json({
      success: false,
      message: "A bookable room must have at least one bed.",
    });
  }

  if (category !== "DORMITORY" && genderRestriction !== "ANY") {
    return res.status(400).json({
      success: false,
      message: "Gender restrictions can only be configured for DM/Dormitory rooms.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      SELECT r.id, r.room_number, r.category_id
      FROM rooms r
      WHERE r.id = $1 AND r.is_active = TRUE
      FOR UPDATE OF r
      `,
      [roomId]
    );
    if (roomResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    const roomUseResult = await client.query(
      `
      SELECT EXISTS (
        SELECT 1
        FROM booking_acceptances ba
        INNER JOIN bookings b ON b.id = ba.booking_id
        WHERE ba.room_id = $1
          AND ba.acceptance_status = 'ACCEPTED'
          AND b.expected_check_out_date >= CURRENT_DATE
          AND b.booking_status NOT IN ('CANCELLED', 'REJECTED')
      )
      OR EXISTS (
        SELECT 1
        FROM allotments a
        WHERE a.room_id = $1
          AND a.allotment_status = 'ALLOTTED'
          AND NOT EXISTS (
            SELECT 1 FROM check_outs co WHERE co.allotment_id = a.id
          )
      )
      OR EXISTS (
        SELECT 1
        FROM beds bed
        WHERE bed.room_id = $1
          AND bed.is_active = TRUE
          AND UPPER(bed.bed_status) <> 'AVAILABLE'
      )
      OR EXISTS (
        SELECT 1
        FROM housekeeping_tasks ht
        WHERE ht.room_id = $1
          AND UPPER(REPLACE(ht.task_status, ' ', '_')) <> 'CLEARED'
      ) AS has_live_use
      `,
      [roomId]
    );
    if (roomUseResult.rows[0].has_live_use) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message:
          "Room settings cannot be changed while bookings, allotments, unavailable beds, or unfinished housekeeping exist.",
      });
    }

    const categoryResult = await client.query(
      `
      SELECT id, category_name
      FROM room_categories
      WHERE CASE $1::TEXT
        WHEN 'AC' THEN UPPER(TRIM(category_name)) = 'AC'
        WHEN 'NON_AC' THEN
          UPPER(REPLACE(REPLACE(TRIM(category_name), '-', '_'), ' ', '_'))
            IN ('NON_AC', 'NAC')
        WHEN 'DORMITORY' THEN
          UPPER(REPLACE(REPLACE(TRIM(category_name), '-', '_'), ' ', '_'))
            IN ('DORMITORY', 'DM')
        WHEN 'VIP' THEN UPPER(TRIM(category_name)) = 'VIP'
        WHEN 'HALL' THEN UPPER(TRIM(category_name)) = 'HALL'
      END
      ORDER BY
        CASE WHEN UPPER(TRIM(category_name)) = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [category]
    );
    if (categoryResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: `The ${category} room category is not configured.`,
      });
    }

    const duplicateRoom = await client.query(
      `
      SELECT 1
      FROM rooms
      WHERE UPPER(TRIM(room_number)) = UPPER(TRIM($1))
        AND id <> $2
      LIMIT 1
      `,
      [roomNumber, roomId]
    );
    if (duplicateRoom.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "That room number is already in use.",
      });
    }

    const targetBedUse = await client.query(
      `
      SELECT 1
      FROM beds bed
      WHERE bed.room_id = $1
        AND bed.bed_number > $2
        AND bed.is_active = TRUE
        AND EXISTS (
          SELECT 1
          FROM allotments a
          WHERE a.bed_id = bed.id
            AND a.allotment_status = 'ALLOTTED'
            AND NOT EXISTS (
              SELECT 1 FROM check_outs co WHERE co.allotment_id = a.id
            )
        )
      LIMIT 1
      `,
      [roomId, totalBeds]
    );
    if (targetBedUse.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "A bed above the new capacity still has an active allotment.",
      });
    }

    const updatedRoom = await client.query(
      `
      UPDATE rooms
      SET
        room_number = $2,
        category_id = $3,
        total_beds = $4,
        room_status = CASE
          WHEN $4 = 0 THEN 'STORE'
          WHEN room_status = 'STORE' THEN 'AVAILABLE'
          ELSE room_status
        END,
        is_bookable = $5,
        gender_restriction = $6,
        room_note = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, room_number, total_beds, is_bookable,
        gender_restriction, room_note
      `,
      [
        roomId,
        roomNumber,
        categoryResult.rows[0].id,
        totalBeds,
        isBookable,
        genderRestriction,
        roomNote,
      ]
    );

    await client.query(
      `
      UPDATE beds
      SET
        is_active = bed_number <= $2,
        bed_status = CASE
          WHEN bed_number <= $2 THEN 'AVAILABLE'
          ELSE bed_status
        END
      WHERE room_id = $1
      `,
      [roomId, totalBeds]
    );
    await client.query(
      `
      INSERT INTO beds (room_id, bed_number, bed_status, is_active)
      SELECT $1, generated.bed_number, 'AVAILABLE', TRUE
      FROM generate_series(1, $2) AS generated(bed_number)
      WHERE NOT EXISTS (
        SELECT 1
        FROM beds existing_bed
        WHERE existing_bed.room_id = $1
          AND existing_bed.bed_number = generated.bed_number
      )
      `,
      [roomId, totalBeds]
    );
    await client.query(
      `
      INSERT INTO room_rate_cards (
        room_id, room_capacity, bed_capacity, updated_by, updated_at
      )
      VALUES ($1, NULLIF($2, 0), $2, $3, CURRENT_TIMESTAMP)
      ON CONFLICT (room_id)
      DO UPDATE SET
        room_capacity = EXCLUDED.room_capacity,
        bed_capacity = EXCLUDED.bed_capacity,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      `,
      [roomId, totalBeds, req.authUser.id]
    );

    if (!isBookable) {
      await client.query(
        `
        UPDATE room_permissions
        SET can_book = FALSE,
            can_allot = FALSE,
            can_approve = FALSE,
            emergency_allot = FALSE
        WHERE room_id = $1
        `,
        [roomId]
      );
    } else {
      let permissionTemplate = await client.query(
        `
        SELECT DISTINCT ON (permission.role_name)
          permission.role_name,
          permission.can_book,
          permission.can_allot,
          permission.can_approve,
          permission.emergency_allot
        FROM rooms template_room
        INNER JOIN room_permissions permission
          ON permission.room_id = template_room.id
        WHERE template_room.id <> $1
          AND template_room.is_active = TRUE
          AND template_room.is_bookable = TRUE
          AND template_room.category_id = $2
          AND (permission.can_book OR permission.can_allot)
        ORDER BY permission.role_name, template_room.room_number
        `,
        [roomId, categoryResult.rows[0].id]
      );
      if (
        permissionTemplate.rowCount === 0 &&
        roomResult.rows[0].category_id === categoryResult.rows[0].id
      ) {
        permissionTemplate = await client.query(
          `
          SELECT role_name, can_book, can_allot, can_approve, emergency_allot
          FROM room_permissions
          WHERE room_id = $1
            AND (can_book = TRUE OR can_allot = TRUE)
          ORDER BY role_name
          `,
          [roomId]
        );
      }
      if (permissionTemplate.rowCount === 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "No room permissions are configured for this bookable category. Configure an existing room of this category first.",
        });
      }
      for (const permission of permissionTemplate.rows) {
        await client.query(
          `
          INSERT INTO room_permissions (
            room_id, role_name, can_book, can_allot, can_approve, emergency_allot
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (room_id, role_name)
          DO UPDATE SET
            can_book = EXCLUDED.can_book,
            can_allot = EXCLUDED.can_allot,
            can_approve = EXCLUDED.can_approve,
            emergency_allot = EXCLUDED.emergency_allot
          `,
          [
            roomId,
            permission.role_name,
            permission.can_book,
            permission.can_allot,
            permission.can_approve,
            permission.emergency_allot,
          ]
        );
      }
    }

    await client.query("COMMIT");
    return res.json({
      success: true,
      room: {
        ...updatedRoom.rows[0],
        category_name: categoryResult.rows[0].category_name,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Room customization update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to save room customizations.",
    });
  } finally {
    client.release();
  }
});

router.put("/:roomId/rate-card", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can update room rates and capacities.",
    });
  }

  const { roomId } = req.params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid room ID is required.",
    });
  }

  const fields = [
    "room_capacity",
    "bed_capacity",
    "esm_room_rate",
    "serving_room_rate",
    "civilian_room_rate",
  ] as const;
  const values: (number | null)[] = [];

  for (const field of fields) {
    const value: unknown = req.body[field];
    if (value === undefined || value === null || value === "") {
      values.push(null);
      continue;
    }

    const numberValue = Number(value);
    const isCapacity = field.endsWith("_capacity");
    if (
      !Number.isFinite(numberValue) ||
      (isCapacity
        ? !Number.isInteger(numberValue) ||
          numberValue < (field === "bed_capacity" ? 0 : 1)
        : numberValue <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: `Invalid value for ${field}.`,
      });
    }
    values.push(numberValue);
  }

  try {
    const roomResult = await pool.query(
      "SELECT 1 FROM rooms WHERE id = $1 AND is_active = TRUE",
      [roomId]
    );
    if (roomResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO room_rate_cards (
        room_id,
        room_capacity,
        bed_capacity,
        esm_room_rate,
        serving_room_rate,
        civilian_room_rate,
        updated_by,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      ON CONFLICT (room_id)
      DO UPDATE SET
        room_capacity = EXCLUDED.room_capacity,
        bed_capacity = EXCLUDED.bed_capacity,
        esm_room_rate = EXCLUDED.esm_room_rate,
        serving_room_rate = EXCLUDED.serving_room_rate,
        civilian_room_rate = EXCLUDED.civilian_room_rate,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [roomId, ...values, req.authUser!.id]
    );

    return res.json({ success: true, rateCard: result.rows[0] });
  } catch (error) {
    console.error("Room rate-card update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update the room rate card.",
    });
  }
});

router.put("/:roomId/gender-restriction", async (req, res) => {
  if (req.authUser?.role !== "ADMIN") {
    return res.status(403).json({
      success: false,
      message: "Only an ADMIN can update room gender restrictions.",
    });
  }

  const { roomId } = req.params;
  const genderRestriction =
    typeof req.body?.gender_restriction === "string"
      ? req.body.gender_restriction.trim().toUpperCase()
      : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      roomId
    ) ||
    !["ANY", "MALE", "FEMALE"].includes(genderRestriction)
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide a valid room ID and gender restriction.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roomResult = await client.query(
      `
      SELECT r.id, r.room_number, r.gender_restriction,
        rc.category_name
      FROM rooms r
      INNER JOIN room_categories rc ON rc.id = r.category_id
      WHERE r.id = $1 AND r.is_active = TRUE
      FOR UPDATE OF r
      `,
      [roomId]
    );
    if (roomResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Active room was not found.",
      });
    }

    const room = roomResult.rows[0];
    const normalizedCategory = String(room.category_name)
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
    if (
      normalizedCategory !== "DM" &&
      normalizedCategory !== "DORMITORY" &&
      !normalizedCategory.includes("DORMITORY")
    ) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: "Gender restrictions can only be changed for DM/Dormitory rooms.",
      });
    }

    if (room.gender_restriction !== genderRestriction) {
      const roomUseResult = await client.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM booking_acceptances ba
          INNER JOIN bookings b ON b.id = ba.booking_id
          WHERE ba.room_id = $1
            AND ba.acceptance_status = 'ACCEPTED'
            AND b.expected_check_out_date >= CURRENT_DATE
            AND b.booking_status NOT IN ('CANCELLED', 'REJECTED')
        )
        OR EXISTS (
          SELECT 1
          FROM allotments a
          WHERE a.room_id = $1
            AND a.allotment_status = 'ALLOTTED'
            AND NOT EXISTS (
              SELECT 1 FROM check_outs co WHERE co.allotment_id = a.id
            )
        )
        OR EXISTS (
          SELECT 1
          FROM beds bed
          WHERE bed.room_id = $1
            AND bed.is_active = TRUE
            AND UPPER(bed.bed_status) <> 'AVAILABLE'
        )
        OR EXISTS (
          SELECT 1
          FROM housekeeping_tasks ht
          WHERE ht.room_id = $1
            AND UPPER(REPLACE(ht.task_status, ' ', '_')) <> 'CLEARED'
        ) AS has_live_use
        `,
        [roomId]
      );
      if (roomUseResult.rows[0].has_live_use) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message:
            "The gender restriction cannot be changed while this room has an active/future booking, allotment, unavailable bed, or unfinished housekeeping task.",
        });
      }
    }

    const updatedRoom = await client.query(
      `
      UPDATE rooms
      SET gender_restriction = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, room_number, gender_restriction
      `,
      [roomId, genderRestriction]
    );
    await client.query("COMMIT");
    return res.json({ success: true, room: updatedRoom.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Room gender restriction update error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update the room gender restriction.",
    });
  } finally {
    client.release();
  }
});

/*
=========================================================
GET ROOMS FOR LOGGED-IN USER
=========================================================

IMPORTANT ROOM STATUS RULE:

1. Actual checked-in guest
   -> OCCUPIED

2. Allotted but not checked-in
   -> RESERVED

3. Checked-out / housekeeping required
   -> NEEDS_CLEANING

4. Housekeeping in progress
   -> CLEANING

5. No active occupant / allotment / cleaning task
   -> AVAILABLE

The database room_status is also updated so old stale
"OCCUPIED" values do not remain forever.
=========================================================
*/

router.get("/", async (req, res) => {
  try {
    const requestedDates =
      readRequestedDateRange(req);

    if (!requestedDates) {
      return res.status(400).json({
        success: false,
        message:
          "Provide valid check_in_date and expected_check_out_date values in YYYY-MM-DD format.",
      });
    }

    const roleName = req.authUser?.role;

    if (!roleName) {
      return res.status(401).json({
        success: false,
        message: "Authenticated user is required",
      });
    }

    /*
    =====================================================
    1. GET ROOMS
    =====================================================
    */

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.room_number,
        r.total_beds,
        r.room_status,
        r.room_status AS current_status,
        r.is_under_maintenance,
        r.is_active,
        r.allowed_gender,
        r.room_usage,
        r.is_bookable,
        r.gender_restriction,
        r.room_note,

        rc.category_name,

        rp.can_book,
        rp.can_allot,
        rp.can_approve,
        rp.emergency_allot,
        approving_authority.role_name AS approval_authority_role,
        (
          $1 = 'RECEPTIONIST'
          AND rp.can_book = FALSE
          AND rp.can_allot = TRUE
          AND approving_authority.role_name IS NOT NULL
        ) AS is_other_authority_room

      FROM rooms r

      INNER JOIN room_categories rc
        ON rc.id = r.category_id

        LEFT JOIN room_permissions rp
        ON rp.room_id = r.id
       AND rp.role_name = $1

      LEFT JOIN LATERAL (
        SELECT authority.role_name
        FROM room_permissions authority
        WHERE authority.room_id = r.id
          AND authority.role_name <> 'RECEPTIONIST'
          AND authority.can_approve = TRUE
        ORDER BY authority.role_name
        LIMIT 1
      ) approving_authority
        ON TRUE

      WHERE
        r.is_active = TRUE
        AND r.is_bookable = TRUE
        AND (
          r.total_beds > 0
          OR r.room_status = 'STORE'
        )
        AND (
          $1 = 'ADMIN'
          OR
          rp.can_book = TRUE
          OR (
            $1 = 'RECEPTIONIST'
            AND rp.can_allot = TRUE
            AND rp.can_book = FALSE
            AND approving_authority.role_name IS NOT NULL
          )
        )

      ORDER BY
        CASE rc.category_name
          WHEN 'AC' THEN 1
          WHEN 'VIP' THEN 2
          WHEN 'NON_AC' THEN 3
          WHEN 'DORMITORY' THEN 4
          WHEN 'HALL' THEN 5
          ELSE 6
        END,
        r.room_number;
      `,
      [roleName]
    );

    const roomIds =
      result.rows.map(
        (room) => room.id
      );

    const assignmentResult =
      roomIds.length > 0
        ? await pool.query(
            `
            SELECT
              a.room_id,
              a.id AS allotment_id,
              a.allotment_status,
              b.booking_reference,
              g.id AS guest_id,
              g.guest_name,
              g.mobile_number,
              b.check_in_date,
              b.expected_check_out_date,
              ci.check_in_time,
              CASE
                WHEN ci.id IS NULL
                  THEN 'NOT_CHECKED_IN'
                ELSE 'CHECKED_IN'
              END AS check_in_status
            FROM allotments a
            INNER JOIN bookings b
              ON b.id = a.booking_id
            LEFT JOIN LATERAL (
              SELECT bg.guest_id
              FROM booking_guests bg
              WHERE bg.booking_id = a.booking_id
              ORDER BY bg.is_primary_guest DESC,
                bg.created_at ASC
              LIMIT 1
            ) primary_guest
              ON a.guest_id IS NULL
            LEFT JOIN guests g
              ON g.id = COALESCE(
                a.guest_id,
                primary_guest.guest_id
              )
            LEFT JOIN LATERAL (
              SELECT
                ci.id,
                ci.check_in_time
              FROM check_ins ci
              WHERE ci.allotment_id = a.id
                AND ci.guest_id = g.id
              ORDER BY ci.check_in_time DESC
              LIMIT 1
            ) ci ON TRUE
            WHERE a.room_id = ANY($1::uuid[])
              AND a.allotment_status = 'ALLOTTED'
              AND NOT EXISTS (
                SELECT 1
                FROM check_outs co
                WHERE co.allotment_id = a.id
              )
            ORDER BY
              a.room_id,
              b.booking_reference,
              g.guest_name
            `,
            [roomIds]
          )
        : { rows: [] };

    const assignmentsByRoom =
      new Map<string, typeof assignmentResult.rows>();

    for (const assignment of assignmentResult.rows) {
      const roomAssignments =
        assignmentsByRoom.get(
          assignment.room_id
        ) || [];

      roomAssignments.push(
        assignment
      );

      assignmentsByRoom.set(
        assignment.room_id,
        roomAssignments
      );
    }

    /*
    =====================================================
    2. PROCESS EACH ROOM
    =====================================================
    */

    const rooms = [];

    for (const room of result.rows) {
      /*
      -----------------------------------------------------
      CURRENT CHECKED-IN GUESTS
      -----------------------------------------------------
      */

      const checkedInResult =
        await pool.query(
          `
          SELECT
            COUNT(*)::INTEGER AS count

          FROM check_ins ci

          INNER JOIN allotments a
            ON a.id = ci.allotment_id

          LEFT JOIN check_outs co
            ON co.allotment_id = ci.allotment_id

          WHERE
            a.room_id = $1
            AND a.allotment_status = 'ALLOTTED'
            AND co.id IS NULL
          `,
          [room.id]
        );

      const checkedInCount = Number(
        checkedInResult.rows[0]?.count || 0
      );

      /*
      -----------------------------------------------------
      ACTIVE ALLOTMENTS
      -----------------------------------------------------

      This includes guests who are allotted but have
      not checked in yet.
      -----------------------------------------------------
      */

      const activeAllotmentResult =
        await pool.query(
          `
          SELECT
            COUNT(*)::INTEGER AS count

          FROM allotments a

          WHERE
            a.room_id = $1
            AND a.allotment_status = 'ALLOTTED'
            AND NOT EXISTS (
              SELECT 1
              FROM check_outs co
              WHERE co.allotment_id = a.id
            )
          `,
          [room.id]
        );

      const activeAllotmentCount = Number(
        activeAllotmentResult.rows[0]?.count || 0
      );

      /*
      -----------------------------------------------------
      HOUSEKEEPING STATUS
      -----------------------------------------------------

      Take the latest active housekeeping task.

      We do NOT consider old completed tasks.
      -----------------------------------------------------
      */

      const housekeepingResult =
        await pool.query(
          `
          SELECT
            task_status,
            assigned_at

          FROM housekeeping_tasks

          WHERE room_id = $1

          ORDER BY assigned_at DESC

          LIMIT 1
          `,
          [room.id]
        );

      const latestHousekeeping =
        housekeepingResult.rows[0] || null;

      const housekeepingStatus =
        latestHousekeeping?.task_status
          ? String(
              latestHousekeeping.task_status
            ).toUpperCase()
          : null;
      const storedRoomStatus = String(
        room.room_status || ""
      ).toUpperCase();

      /*
      -----------------------------------------------------
      DETERMINE REAL ROOM STATUS
      -----------------------------------------------------
      */

      let calculatedRoomStatus =
        "AVAILABLE";

      /*
      Priority 1:
      REAL CHECKED-IN GUEST
      */

      if (room.is_under_maintenance) {
        calculatedRoomStatus = "MAINTENANCE";
      } else if (checkedInCount > 0) {
        calculatedRoomStatus =
          "OCCUPIED";
      }

      else if (
        storedRoomStatus === "OUT" ||
        storedRoomStatus === "OUT_OF_SERVICE" ||
        storedRoomStatus === "OUT OF SERVICE"
      ) {
        calculatedRoomStatus =
          "OUT_OF_SERVICE";
      }

      /*
      Priority 2:
      HOUSEKEEPING CURRENTLY IN PROGRESS
      */

      else if (
        housekeepingStatus === "CLEANING" ||
        housekeepingStatus ===
          "HOUSEKEEPING" ||
        housekeepingStatus ===
          "HOUSEKEEPING / CLEANING"
      ) {
        calculatedRoomStatus =
          "CLEANING";
      }

      /*
      Priority 3:
      ROOM NEEDS CLEANING
      */

      else if (
        housekeepingStatus ===
          "NEEDS CLEANING" ||
        housekeepingStatus ===
          "NEEDS_CLEANING" ||
        storedRoomStatus === "NEEDS CLEANING" ||
        storedRoomStatus === "NEEDS_CLEANING"
      ) {
        calculatedRoomStatus =
          "NEEDS_CLEANING";
      }

      /*
      Priority 4:
      ACTIVE ALLOTMENT BUT NO CHECK-IN

      This is NOT OCCUPIED.
      */

      else if (
        activeAllotmentCount > 0
      ) {
        calculatedRoomStatus =
          "RESERVED";
      }

      /*
      Priority 5:
      NO OCCUPANT / ALLOTMENT /
      ACTIVE CLEANING TASK
      */

      else {
        calculatedRoomStatus =
          "AVAILABLE";
      }

      /*
      -----------------------------------------------------
      GET BEDS
      -----------------------------------------------------
      */

      const bedsResult =
        await pool.query(
          `
          SELECT
            b.id,
            b.room_id,
            b.bed_number,
            b.bed_status,
            b.is_active

          FROM beds b

          WHERE
            b.room_id = $1
            AND b.is_active = TRUE

          ORDER BY
            b.bed_number
          `,
          [room.id]
        );

      const beds = room.is_under_maintenance
        ? bedsResult.rows.map((bed) => ({
            ...bed,
            bed_status: "OUT_OF_SERVICE",
          }))
        : bedsResult.rows;

      /*
      -----------------------------------------------------
      ACTIVE BED ALLOTMENTS
      -----------------------------------------------------

      Only currently ALLOTTED beds count as occupied.

      RELEASED allotments do NOT count.
      -----------------------------------------------------
      */

      const activeBedResult =
        await pool.query(
          `
          SELECT
            a.bed_id

          FROM allotments a

          WHERE
            a.room_id = $1
            AND a.allotment_status = 'ALLOTTED'
            AND a.bed_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM check_outs co
              WHERE co.allotment_id = a.id
            )
          `,
          [room.id]
        );

      const activeBedIds = new Set(
        activeBedResult.rows.map(
          (row) => row.bed_id
        )
      );

      /*
      -----------------------------------------------------
      AVAILABLE BED COUNT
      -----------------------------------------------------

      A bed is available only when:

      1. active
      2. AVAILABLE
      3. not actively allotted
      -----------------------------------------------------
      */

      const availableBeds = beds.filter(
        (bed) =>
          String(
            bed.bed_status
          ).toUpperCase() ===
            "AVAILABLE" &&
          !activeBedIds.has(bed.id)
      );

      /*
      -----------------------------------------------------
      IMPORTANT FOR ROOM-LEVEL AC / NAC / VIP
      -----------------------------------------------------

      For these rooms the receptionist selects the room,
      not individual beds.

      If room is OCCUPIED / RESERVED /
      NEEDS_CLEANING / CLEANING,

      the room itself is unavailable even if individual
      bed rows still say AVAILABLE.

      Therefore the frontend gets a correct availability
      number based on room status.
      -----------------------------------------------------
      */

      let availableBedCount =
        availableBeds.length;

      const roomLevelCategory =
        String(
          room.category_name || ""
        ).toUpperCase();

      const isRoomLevel =
        roomLevelCategory.includes(
          "AC"
        ) ||
        roomLevelCategory.includes(
          "NAC"
        ) ||
        roomLevelCategory.includes(
          "VIP"
        );

      if (
        isRoomLevel &&
        calculatedRoomStatus !==
          "AVAILABLE"
      ) {
        availableBedCount = 0;
      }

      /*
      -----------------------------------------------------
      RETURN ROOM
      -----------------------------------------------------
      */

      rooms.push({
        ...room,

        room_status:
          calculatedRoomStatus,

        total_beds:
          Number(room.total_beds),

        available_beds:
          availableBedCount,

        available_bed_count:
          availableBedCount,

        occupied_bed_count:
          Math.max(
            0,
            Number(room.total_beds) -
              availableBedCount
          ),

        checked_in_count:
          checkedInCount,

        active_allotment_count:
          activeAllotmentCount,

        assignments:
          assignmentsByRoom.get(
            room.id
          ) || [],

        current_status:
          room.room_status === "STORE"
            ? "STORE"
            : calculatedRoomStatus,

        beds,
      });
    }

    /*
    =====================================================
    FINAL RESPONSE
    =====================================================
    */

    return res.json({
      success: true,
      role: roleName,
      rooms,
    });

  } catch (error) {
    console.error(
      "Room fetch error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to fetch rooms",
    });
  }
});


/*
=========================================================
GET OTHER AUTHORITY ROOMS
RECEPTIONIST EXPLICIT ALLOTMENT
=========================================================
*/

router.get(
  "/authority-rooms",
  async (req, res) => {
    try {
      const roleName = req.authUser?.role;

      if (!roleName) {
        return res.status(401).json({
          success: false,
          message:
            "Authenticated user is required",
        });
      }

      /*
      Only Receptionist can use this endpoint.
      */

      if (
        roleName !==
        "RECEPTIONIST"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only the Receptionist can access other authority rooms",
        });
      }

      const result =
        await pool.query(
          `
          SELECT
            r.id,
            r.room_number,
            r.total_beds,
            r.room_status,
            r.room_status AS current_status,
            r.is_active,
            r.is_bookable,
            r.gender_restriction,
            r.room_note,

            rc.category_name,

            rp.can_book
              AS receptionist_can_book,

            rp.can_allot
              AS receptionist_can_allot,

            rp.emergency_allot
              AS receptionist_emergency_allot,

            authority.role_name
              AS authority_role,

            authority.can_book
              AS authority_can_book,

            authority.can_allot
              AS authority_can_allot,

            authority.can_approve
              AS authority_can_approve

          FROM rooms r

          INNER JOIN room_categories rc
            ON rc.id = r.category_id

          INNER JOIN room_permissions rp
            ON rp.room_id = r.id
           AND rp.role_name =
               'RECEPTIONIST'

          INNER JOIN room_permissions authority
            ON authority.room_id = r.id
           AND authority.role_name <>
               'RECEPTIONIST'
           AND authority.can_approve = TRUE

          WHERE
            r.is_active = TRUE
            AND r.is_bookable = TRUE
            AND r.total_beds > 0
            AND rp.can_allot = TRUE
            AND rp.can_book = FALSE

          ORDER BY
            CASE rc.category_name
              WHEN 'AC' THEN 1
              WHEN 'VIP' THEN 2
              WHEN 'NON_AC' THEN 3
              WHEN 'DORMITORY' THEN 4
              WHEN 'HALL' THEN 5
              ELSE 6
            END,

            r.room_number;
          `
        );

      return res.json({
        success: true,
        role: roleName,
        rooms: result.rows,
      });

    } catch (error) {
      console.error(
        "Authority room fetch error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch other authority rooms",
      });
    }
  }
);


/*
=========================================================
GET BEDS FOR A ROOM
=========================================================
*/

router.get(
  "/:roomId/beds",
  async (req, res) => {
    try {
      const requestedDates =
        readRequestedDateRange(req);

      if (!requestedDates) {
        return res.status(400).json({
          success: false,
          message:
            "Provide valid check_in_date and expected_check_out_date values in YYYY-MM-DD format.",
        });
      }

      const {
        roomId,
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            b.id,
            b.room_id,
            b.bed_number,
            CASE
              WHEN EXISTS (
                SELECT 1
                FROM allotments a
                INNER JOIN bookings bk
                  ON bk.id = a.booking_id
                WHERE a.room_id = b.room_id
                  AND (
                    a.bed_id = b.id
                    OR a.bed_id IS NULL
                  )
                  AND a.allotment_status = 'ALLOTTED'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM check_outs co
                    WHERE co.allotment_id = a.id
                  )
                  AND (
                    (
                      $2::date IS NULL
                      AND $3::date IS NULL
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM check_ins ci
                      WHERE ci.allotment_id = a.id
                        AND ci.check_in_time::date <
                          GREATEST($3::date, $2::date + 1)
                        AND GREATEST(
                          bk.expected_check_out_date,
                          bk.check_in_date + 1
                        ) > $2::date
                    )
                    OR (
                      NOT EXISTS (
                        SELECT 1
                        FROM check_ins ci
                        WHERE ci.allotment_id = a.id
                          AND NOT EXISTS (
                            SELECT 1
                            FROM check_outs co
                            WHERE co.allotment_id =
                              ci.allotment_id
                          )
                      )
                      AND bk.check_in_date <
                        GREATEST($3::date, $2::date + 1)
                      AND GREATEST(
                        bk.expected_check_out_date,
                        bk.check_in_date + 1
                      ) > $2::date
                    )
                    OR EXISTS (
                      SELECT 1
                      FROM booking_acceptances ba
                      INNER JOIN bookings accepted_booking
                        ON accepted_booking.id =
                          ba.booking_id
                      WHERE ba.room_id = b.room_id
                        AND (
                          ba.bed_id = b.id
                          OR ba.bed_id IS NULL
                        )
                        AND ba.acceptance_status =
                          'ACCEPTED'
                        AND accepted_booking.approval_status
                          <> 'REJECTED'
                        AND accepted_booking.booking_status
                          NOT IN (
                            'CHECKED_OUT',
                            'CANCELLED',
                            'REJECTED'
                          )
                        AND accepted_booking.check_in_date <
                          GREATEST($3::date, $2::date + 1)
                        AND GREATEST(
                          accepted_booking.expected_check_out_date,
                          accepted_booking.check_in_date + 1
                        ) > $2::date
                        AND NOT EXISTS (
                          SELECT 1
                          FROM allotments accepted_allotment
                          WHERE
                            accepted_allotment.booking_id =
                              accepted_booking.id
                            AND accepted_allotment.room_id =
                              ba.room_id
                            AND accepted_allotment.allotment_status =
                              'ALLOTTED'
                            AND (
                              accepted_allotment.bed_id =
                                ba.bed_id
                              OR accepted_allotment.bed_id
                                IS NULL
                            )
                            AND NOT EXISTS (
                              SELECT 1
                              FROM check_outs accepted_checkout
                              WHERE accepted_checkout.allotment_id =
                                accepted_allotment.id
                            )
                        )
                    )
                  )
              )
                THEN CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM allotments a
                    INNER JOIN check_ins ci
                      ON ci.allotment_id = a.id
                    WHERE a.room_id = b.room_id
                      AND (
                        a.bed_id = b.id
                        OR a.bed_id IS NULL
                      )
                      AND a.allotment_status =
                        'ALLOTTED'
                      AND NOT EXISTS (
                        SELECT 1
                        FROM check_outs co
                        WHERE co.allotment_id = a.id
                      )
                  )
                    THEN 'OCCUPIED'
                  ELSE 'RESERVED'
                END
              WHEN UPPER(b.bed_status) IN (
                'NEEDS_CLEANING',
                'NEEDS CLEANING',
                'CLEANING',
                'OUT',
                'OUT_OF_SERVICE',
                'OUT OF SERVICE'
              )
                THEN UPPER(b.bed_status)
              ELSE 'AVAILABLE'
            END AS bed_status,
            b.is_active

          FROM beds b

          WHERE
            b.room_id = $1
            AND b.is_active = TRUE
            AND EXISTS (
              SELECT 1
              FROM rooms r
              WHERE r.id = b.room_id
                AND r.is_active = TRUE
                AND r.is_bookable = TRUE
            )

          ORDER BY
            b.bed_number;
          `,
          [
            roomId,
            requestedDates.checkIn,
            requestedDates.checkOut,
          ]
        );

      return res.json({
        success: true,
        beds: result.rows,
      });

    } catch (error) {
      console.error(
        "Bed fetch error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to fetch beds",
      });
    }
  }
);


export default router;