import {
  Router,
  Request,
  Response,
} from "express";

import { pool } from "../config/db.js";
import { isRoomGenderAllowed } from "../services/roomGenderRestriction.js";
import { datesOverlap } from "../services/dateOverlap.js";
import { checkBedDateConflict } from "../services/bedDateConflict.js";

const router = Router();

/* =========================================================
   HELPER
   GET THE SUCCESSFUL PAYMENT STATUS ALLOWED BY DATABASE

   Do not hard-code SUCCESS. Read the payments table CHECK
   constraint and use the successful status it allows.
========================================================= */

async function getSuccessfulPaymentStatus(
  client: any
): Promise<string> {

  const result =
    await client.query(
      `
      SELECT
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE
        conname = 'payments_status_check'
        AND conrelid = 'payments'::regclass
      LIMIT 1
      `
    );

  if (
    result.rowCount === 0
  ) {
    throw new Error(
      "payments_status_check constraint was not found."
    );
  }

  const definition =
    String(
      result.rows[0].definition
    );

  const matches =
    definition.match(
      /'([^']+)'/g
    ) || [];

  const allowedStatuses =
    matches.map(
      (value: string) =>
        value.substring(
          1,
          value.length - 1
        )
    );

  const preferredStatuses = [
    "SUCCESS",
    "COMPLETED",
    "PAID",
    "RECEIVED",
  ];

  const successfulStatus =
    preferredStatuses.find(
      (status) =>
        allowedStatuses.includes(
          status
        )
    );

  if (
    successfulStatus
  ) {
    return successfulStatus;
  }

  throw new Error(
    `No successful payment status was found in payments_status_check. Allowed statuses: ${allowedStatuses.join(", ")}`
  );
}



/* =========================================================
   ALLOCATION MODEL

   AC / VIP / NAC
   ----------------
   Whole-room allocation.
   bed_id = NULL

   DM / HALL
   ----------------
   Individual-bed allocation.
   bed_id = actual bed UUID
========================================================= */


/* =========================================================
   HELPER
   DETERMINE WHETHER A ROOM IS ROOM-LEVEL ALLOCATION

   AC / VIP / NAC = WHOLE ROOM
   DM / HALL      = INDIVIDUAL BED
========================================================= */

function isWholeRoomCategory(
  categoryName: string
): boolean {

  const category =
    categoryName
      .trim()
      .toUpperCase();

  return (
    category === "AC" ||
    category === "NAC" ||
    category === "NON_AC" ||
    category === "VIP" ||
    category.includes("AC VIP")
  );

}

/* =========================================================
   HELPER
   CREATE PENDING APPROVALS

   Responsible authority comes from:
   room_permissions.can_approve = TRUE
========================================================= */

async function createBookingApprovals(
  client: any,
  bookingId: string,
  roomIds: string[]
): Promise<void> {

  const uniqueRoomIds = [
    ...new Set(roomIds),
  ];


  for (
    const roomId of uniqueRoomIds
  ) {

    const permissionResult =
      await client.query(
        `
        SELECT
          rp.role_name,
          r.room_number
        FROM room_permissions rp

        INNER JOIN rooms r
          ON r.id = rp.room_id

        WHERE
          rp.room_id = $1
          AND rp.can_approve = TRUE

        ORDER BY
          rp.role_name
        `,
        [
          roomId,
        ]
      );


    if (
      permissionResult.rowCount === 0
    ) {

      console.warn(
        `No approval authority configured for room ${roomId}.`
      );

      continue;
    }


    for (
      const permission
      of permissionResult.rows
    ) {

      const authorityRole =
        permission.role_name;

      const roomNumber =
        permission.room_number;


      const approverResult =
        await client.query(
          `
          SELECT
            u.id,
            u.full_name,
            u.username,
            r.role_name

          FROM users u

          INNER JOIN roles r
            ON r.id = u.role_id

          WHERE
            r.role_name = $1
            AND u.is_active = TRUE

          ORDER BY
            u.created_at ASC

          LIMIT 1
          `,
          [
            authorityRole,
          ]
        );


      if (
        approverResult.rowCount === 0
      ) {

        console.warn(
          `No active user found for approval role ${authorityRole} for room ${roomNumber}.`
        );

        continue;
      }


      const approver =
        approverResult.rows[0];


      const existingApprovalResult =
        await client.query(
          `
          SELECT
            id,
            approval_status

          FROM booking_approvals

          WHERE
            booking_id = $1
            AND approver_id = $2

          ORDER BY
            created_at DESC

          LIMIT 1
          `,
          [
            bookingId,
            approver.id,
          ]
        );


      if (
        existingApprovalResult.rowCount &&
        existingApprovalResult.rowCount > 0
      ) {

        const existingApproval =
          existingApprovalResult.rows[0];


        if (
          existingApproval.approval_status ===
          "PENDING"
        ) {

          continue;
        }


        continue;
      }


      await client.query(
        `
        INSERT INTO booking_approvals (
          booking_id,
          approver_id,
          approval_status,
          remarks
        )

        VALUES (
          $1,
          $2,
          'PENDING',
          NULL
        )
        `,
        [
          bookingId,
          approver.id,
        ]
      );


      console.log(
        `Approval created: Booking ${bookingId}, Room ${roomNumber}, Approver ${approver.full_name} (${authorityRole})`
      );

    }

  }

}


/* =========================================================
   HELPER
   DATE OVERLAP

   Existing:
       10 Sep -> 12 Sep

   New:
       11 Sep -> 13 Sep

   CONFLICT

   Existing:
       10 Sep -> 12 Sep

   New:
       12 Sep -> 14 Sep

   NO CONFLICT

   Checkout date is treated as release date.
========================================================= */



/* =========================================================
   HELPER
   CHECK WHOLE-ROOM DATE CONFLICT

   Used for:
   AC / VIP / NAC
========================================================= */

async function checkRoomDateConflict(
  client: any,
  roomId: string,
  bookingId: string,
  checkInDate: string,
  checkOutDate: string
): Promise<{
  conflict: boolean;
  bookingReference?: string;
  checkInDate?: string;
  checkOutDate?: string;
}> {

  await client.query(
    `
    SELECT id
    FROM rooms
    WHERE id = $1
    FOR UPDATE
    `,
    [roomId]
  );

  const result =
    await client.query(
      `
      SELECT
        b.booking_reference,
        b.check_in_date,
        b.expected_check_out_date

      FROM allotments a

      INNER JOIN bookings b
        ON b.id = a.booking_id

      WHERE
        a.room_id = $1

        AND a.booking_id <> $2

        AND a.allotment_status = 'ALLOTTED'

        AND b.booking_status NOT IN (
          'CANCELLED',
          'REJECTED'
        )

      ORDER BY
        b.check_in_date ASC
      `,
      [
        roomId,
        bookingId,
      ]
    );


  for (
    const row of result.rows
  ) {

    if (
      datesOverlap(
        row.check_in_date,
        row.expected_check_out_date,
        checkInDate,
        checkOutDate
      )
    ) {

      return {
        conflict: true,
        bookingReference:
          row.booking_reference,
        checkInDate:
          row.check_in_date,
        checkOutDate:
          row.expected_check_out_date,
      };

    }

  }


  return {
    conflict: false,
  };

}


/* =========================================================
   HELPER
   VERIFY ROOM PERMISSION
========================================================= */

async function verifyRoomPermission(
  client: any,
  roomId: string,
  roleName: string,
  isEmergency: boolean
): Promise<void> {

  const permissionResult =
    await client.query(
      `
      SELECT
        can_allot,
        emergency_allot

      FROM room_permissions

      WHERE
        room_id = $1
        AND role_name = $2
      `,
      [
        roomId,
        roleName,
      ]
    );


  if (
    permissionResult.rowCount === 0
  ) {

    throw new Error(
      "You do not have permission to allot this room."
    );

  }


  const permission =
    permissionResult.rows[0];


  if (
    isEmergency
  ) {

    if (
      !permission.emergency_allot
    ) {

      throw new Error(
        "Your role does not have emergency allotment permission for this room."
      );

    }

  } else {

    if (
      !permission.can_allot
    ) {

      throw new Error(
        "Your role does not have normal allotment permission for this room."
      );

    }

  }

}


/* =========================================================
   POST /api/allotments/bulk

   MAIN ALLOTMENT ENDPOINT

   ROOM ALLOCATION:
       AC / VIP / NAC

       One whole room is allotted.
       bed_id is NULL.

   BED ALLOCATION:
       DM / HALL

       Exact bed is allotted.
========================================================= */

router.post(
  "/bulk",
  async (
    req: Request,
    res: Response
  ) => {

    const {
      booking_id,
      allotted_by,
      is_emergency_allotment = false,
      remarks = null,
      selections,
    } = req.body;


    /* =====================================
       BASIC VALIDATION
    ===================================== */

    if (
      !booking_id
    ) {

      return res.status(400).json({
        message:
          "Booking ID is required.",
      });

    }


    if (
      !allotted_by
    ) {

      return res.status(400).json({
        message:
          "Allotting user ID is required.",
      });

    }


    if (
      !Array.isArray(selections) ||
      selections.length === 0
    ) {

      return res.status(400).json({
        message:
          "At least one room selection is required.",
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query(
        "BEGIN"
      );


      /* ===================================
         LOCK BOOKING
      =================================== */

      const bookingResult =
        await client.query(
          `
          SELECT
            id,
            booking_reference,
            number_of_guests,
            booking_status,
            booking_type,
            approval_status,
            check_in_date,
            expected_check_out_date

          FROM bookings

          WHERE id = $1

          FOR UPDATE
          `,
          [
            booking_id,
          ]
        );


      if (
        bookingResult.rowCount === 0
      ) {

        throw new Error(
          "Booking not found."
        );

      }


      const booking =
        bookingResult.rows[0];


      const requestedCheckIn =
        booking.check_in_date;

      const requestedCheckOut =
        booking.expected_check_out_date;


      if (
        !requestedCheckIn ||
        !requestedCheckOut
      ) {

        throw new Error(
          "Booking check-in and check-out dates are required."
        );

      }


      if (
        requestedCheckOut <
        requestedCheckIn
      ) {

        throw new Error(
          "Booking check-out date must be after the check-in date."
        );

      }


      /* ===================================
         VERIFY USER
      =================================== */

      const userResult =
        await client.query(
          `
          SELECT
            u.id,
            u.is_active,
            r.role_name

          FROM users u

          INNER JOIN roles r
            ON r.id = u.role_id

          WHERE
            u.id = $1
          `,
          [
            allotted_by,
          ]
        );


      if (
        userResult.rowCount === 0
      ) {

        throw new Error(
          "Allotting user was not found."
        );

      }


      const user =
        userResult.rows[0];


      if (
        !user.is_active
      ) {

        throw new Error(
          "The allotting user's account is inactive."
        );

      }


      const roleName =
        user.role_name;


      /* ===================================
         GET BOOKING GUESTS

         Used to validate guest selections.
      =================================== */

      const bookingGuestsResult =
        await client.query(
          `
          SELECT
            bg.guest_id,
            g.guest_name,
            g.gender

          FROM booking_guests bg

          INNER JOIN guests g
            ON g.id = bg.guest_id

          WHERE
            bg.booking_id = $1
          `,
          [
            booking_id,
          ]
        );


      const bookingGuestIds =
        new Set(
          bookingGuestsResult.rows.map(
            (
              row: {
                guest_id: string;
              }
            ) =>
              row.guest_id
          )
        );
      const bookingGuestGenders = new Map<string, string>(
        bookingGuestsResult.rows.map(
          (row: { guest_id: string; gender: string | null }) => [
            row.guest_id,
            String(row.gender ?? "").trim().toUpperCase(),
          ]
        )
      );


      /* ===================================
         PREPARE ALLOTMENT COLLECTIONS
      =================================== */

      const roomSelections: Array<{
        roomId: string;
        guestIds: string[];
      }> = [];


      const bedSelections: Array<{
        roomId: string;
        bedId: string;
        guestId: string;
      }> = [];


      const selectedRoomIds =
        new Set<string>();


      const selectedBedIds =
        new Set<string>();


      const selectedGuestIds =
        new Set<string>();


      /* ===================================
         PROCESS SELECTIONS
      =================================== */

      for (
        const selection
        of selections
      ) {

        const guestId =
          selection.guest_id;

        const roomId =
          selection.room_id;

        const bedId =
          selection.bed_id ||
          null;


        if (
          !guestId ||
          !roomId
        ) {

          throw new Error(
            "Each selection must contain guest_id and room_id."
          );

        }


        /* ===============================
           VERIFY GUEST
        ================================ */

        if (
          !bookingGuestIds.has(
            guestId
          )
        ) {

          throw new Error(
            "Selected guest does not belong to this booking."
          );

        }


        /* ===============================
           VERIFY DUPLICATE GUEST
        ================================ */

        if (
          selectedGuestIds.has(
            guestId
          )
        ) {

          throw new Error(
            "The same guest cannot be allotted more than once."
          );

        }


        selectedGuestIds.add(
          guestId
        );


        /* ===============================
           LOCK ROOM
        ================================ */

        const roomResult =
          await client.query(
            `
            SELECT
              r.id,
              r.room_number,
              r.room_status,
              r.is_active,
              r.is_bookable,
              r.total_beds,
              r.allowed_gender,
              r.gender_restriction,
              r.room_usage,
              rc.category_name

            FROM rooms r

            INNER JOIN room_categories rc
              ON rc.id = r.category_id

            WHERE
              r.id = $1

            FOR UPDATE
            `,
            [
              roomId,
            ]
          );


        if (
          roomResult.rowCount === 0
        ) {

          throw new Error(
            "Selected room was not found."
          );

        }


        const room =
          roomResult.rows[0];


        if (
          !room.is_active
        ) {

          throw new Error(
            `Room ${room.room_number} is inactive.`
          );

        }

        if (!room.is_bookable || room.room_usage !== "GUEST") {
          throw new Error(
            `Room ${room.room_number} is reserved for staff/storage and cannot be allotted.`
          );
        }

        const guestGender = bookingGuestGenders.get(guestId);
        if (
          room.allowed_gender &&
          String(guestGender ?? "").trim().toUpperCase() !==
            room.allowed_gender
        ) {
          throw new Error(
            `Room ${room.room_number} is reserved for ${room.allowed_gender.toLowerCase()} guests only.`
          );
        }

        if (!isRoomGenderAllowed(room.gender_restriction, guestGender)) {
          throw new Error(
            `Room ${room.room_number} is restricted to ${String(room.gender_restriction).toLowerCase()} guests.`
          );
        }


        const wholeRoom =
          isWholeRoomCategory(
            room.category_name
          );


        /* ===============================
           WHOLE ROOM
           AC / VIP / NAC
        ================================ */

        if (
          wholeRoom
        ) {

          /* -----------------------------
             BED MUST NOT BE SELECTED
          ------------------------------ */

          if (
            bedId
          ) {

            throw new Error(
              `Room ${room.room_number} is a whole-room accommodation. A bed must not be selected.`
            );

          }


          /* -----------------------------
             ONLY ONE ROOM SELECTION
             PER ROOM
          ------------------------------ */

          if (
            selectedRoomIds.has(
              roomId
            )
          ) {

            const existingRoom =
              roomSelections.find(
                (
                  item
                ) =>
                  item.roomId ===
                  roomId
              );


            if (
              existingRoom
            ) {

              existingRoom.guestIds.push(
                guestId
              );

            }

            continue;
          }


          selectedRoomIds.add(
            roomId
          );


          /* -----------------------------
             CHECK DATE CONFLICT
          ------------------------------ */

          const roomConflict =
            await checkRoomDateConflict(
              client,
              roomId,
              booking_id,
              requestedCheckIn,
              requestedCheckOut
            );


          if (
            roomConflict.conflict
          ) {

            throw new Error(
              `Room ${room.room_number} is already allotted to booking ${roomConflict.bookingReference} for ${roomConflict.checkInDate} to ${roomConflict.checkOutDate}.`
            );

          }


          /* -----------------------------
             PERMISSION
          ------------------------------ */

          await verifyRoomPermission(
            client,
            roomId,
            roleName,
            Boolean(
              is_emergency_allotment
            )
          );


          roomSelections.push({
            roomId,
            guestIds: [
              guestId,
            ],
          });


          continue;
        }


        /* ===============================
           BED-LEVEL ROOM
           DM / HALL
        ================================ */

        if (
          !bedId
        ) {

          throw new Error(
            `Room ${room.room_number} requires an exact bed/seat selection.`
          );

        }


        /* -----------------------------
           DUPLICATE BED
        ------------------------------ */

        if (
          selectedBedIds.has(
            bedId
          )
        ) {

          throw new Error(
            `The same bed cannot be selected more than once.`
          );

        }


        selectedBedIds.add(
          bedId
        );


        /* -----------------------------
           LOCK BED
        ------------------------------ */

        const bedResult =
          await client.query(
            `
            SELECT
              b.id,
              b.room_id,
              b.bed_number,
              b.bed_status,
              b.is_active

            FROM beds b

            WHERE
              b.id = $1
              AND b.room_id = $2

            FOR UPDATE
            `,
            [
              bedId,
              roomId,
            ]
          );


        if (
          bedResult.rowCount === 0
        ) {

          throw new Error(
            `Selected bed does not belong to room ${room.room_number}.`
          );

        }


        const bed =
          bedResult.rows[0];


        if (
          !bed.is_active
        ) {

          throw new Error(
            `Bed ${bed.bed_number} in room ${room.room_number} is inactive.`
          );

        }


        if (
          !["AVAILABLE", "BOOKED"].includes(
            String(bed.bed_status).toUpperCase()
          )
        ) {

          throw new Error(
            `Bed ${bed.bed_number} in room ${room.room_number} is not available.`
          );

        }


        /* -----------------------------
           DATE CONFLICT
        ------------------------------ */

        const bedConflict =
          await checkBedDateConflict(
            client,
            bedId,
            booking_id,
            requestedCheckIn,
            requestedCheckOut
          );


        if (
          bedConflict.conflict
        ) {

          throw new Error(
            `Room ${room.room_number}, Bed ${bed.bed_number} is already allotted to booking ${bedConflict.bookingReference} for ${bedConflict.checkInDate} to ${bedConflict.checkOutDate}.`
          );

        }


        /* -----------------------------
           PERMISSION
        ------------------------------ */

        await verifyRoomPermission(
          client,
          roomId,
          roleName,
          Boolean(
            is_emergency_allotment
          )
        );


        bedSelections.push({
          roomId,
          bedId,
          guestId,
        });

      }


      /* ===================================
         INSERT WHOLE-ROOM ALLOTMENTS
      =================================== */

      const createdAllotments: unknown[] =
        [];


      for (
        const roomSelection
        of roomSelections
      ) {

        /*
          One allotment row per guest.

          bed_id = NULL because the
          entire room belongs to the booking.
        */

        for (
          const guestId
          of roomSelection.guestIds
        ) {

          const result =
            await client.query(
              `
              INSERT INTO allotments (
                booking_id,
                room_id,
                bed_id,
                guest_id,
                allotted_by,
                allotment_status,
                is_emergency_allotment,
                remarks
              )

              VALUES (
                $1,
                $2,
                NULL,
                $3,
                $4,
                'ALLOTTED',
                $5,
                $6
              )

              RETURNING
                id,
                booking_id,
                room_id,
                bed_id,
                guest_id,
                allotted_by,
                allotment_status,
                is_emergency_allotment,
                allotted_at,
                released_at,
                remarks
              `,
              [
                booking_id,
                roomSelection.roomId,
                guestId,
                allotted_by,
                Boolean(
                  is_emergency_allotment
                ),
                remarks,
              ]
            );


          createdAllotments.push(
            result.rows[0]
          );

        }


        /* -----------------------------
           WHOLE ROOM:
           ALL BEDS BECOME OCCUPIED
        ------------------------------ */

        await client.query(
          `
          UPDATE beds

          SET
            bed_status =
              CASE
                WHEN $2 = 'ADVANCE'
                  THEN 'BOOKED'
                ELSE 'OCCUPIED'
              END

          WHERE
            room_id = $1
            AND is_active = TRUE
          `,
          [
            roomSelection.roomId,
            booking.booking_type,
          ]
        );


        /* -----------------------------
           ROOM BECOMES OCCUPIED
        ------------------------------ */

        await client.query(
          `
          UPDATE rooms

          SET
            room_status =
              CASE
                WHEN $2 = 'ADVANCE'
                  THEN 'BOOKED'
                ELSE 'OCCUPIED'
              END,
            updated_at = CURRENT_TIMESTAMP

          WHERE
            id = $1
          `,
          [
            roomSelection.roomId,
            booking.booking_type,
          ]
        );

      }


      /* ===================================
         INSERT BED-LEVEL ALLOTMENTS
      =================================== */

      for (
        const bedSelection
        of bedSelections
      ) {

        const result =
          await client.query(
            `
            INSERT INTO allotments (
              booking_id,
              room_id,
              bed_id,
              guest_id,
              allotted_by,
              allotment_status,
              is_emergency_allotment,
              remarks
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'ALLOTTED',
              $6,
              $7
            )

            RETURNING
              id,
              booking_id,
              room_id,
              bed_id,
              guest_id,
              allotted_by,
              allotment_status,
              is_emergency_allotment,
              allotted_at,
              released_at,
              remarks
            `,
            [
              booking_id,
              bedSelection.roomId,
              bedSelection.bedId,
              bedSelection.guestId,
              allotted_by,
              Boolean(
                is_emergency_allotment
              ),
              remarks,
            ]
          );


        createdAllotments.push(
          result.rows[0]
        );


        /* -----------------------------
           MARK SELECTED BED OCCUPIED
        ------------------------------ */

        await client.query(
          `
          UPDATE beds

          SET
            bed_status =
              CASE
                WHEN $2 = 'ADVANCE'
                  THEN 'BOOKED'
                ELSE 'OCCUPIED'
              END

          WHERE
            id = $1
          `,
          [
            bedSelection.bedId,
            booking.booking_type,
          ]
        );


        /* -----------------------------
           UPDATE DM/HALL ROOM STATUS
        ------------------------------ */

        const availableBeds =
          await client.query(
            `
            SELECT
              COUNT(*) AS count

            FROM beds

            WHERE
              room_id = $1
              AND is_active = TRUE
              AND bed_status = 'AVAILABLE'
            `,
            [
              bedSelection.roomId,
            ]
          );


        const availableCount =
          Number(
            availableBeds.rows[0].count
          );


        await client.query(
          `
          UPDATE rooms

          SET
            room_status =
              CASE
                WHEN $2 = 0 AND $3 = 'ADVANCE'
                  THEN 'BOOKED'
                WHEN $2 = 0
                  THEN 'OCCUPIED'
                ELSE 'AVAILABLE'
              END,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $1
          `,
          [
            bedSelection.roomId,
            availableCount,
          ]
        );

      }


      /* ===================================
         VERIFY AT LEAST ONE ALLOTMENT
      =================================== */

      if (
        createdAllotments.length === 0
      ) {

        throw new Error(
          "No allotment was created."
        );

      }


      /* ===================================
         UPDATE BOOKING STATUS
      =================================== */

      await client.query(
        `
        UPDATE bookings

        SET
          booking_status = 'ALLOTTED',
          updated_at = CURRENT_TIMESTAMP

        WHERE
          id = $1
        `,
        [
          booking_id,
        ]
      );


      /* ===================================
         CREATE APPROVAL WORKFLOW
      =================================== */

      const allRoomIds = [
        ...new Set([
          ...roomSelections.map(
            (
              selection
            ) =>
              selection.roomId
          ),

          ...bedSelections.map(
            (
              selection
            ) =>
              selection.roomId
          ),
        ]),
      ];


      await createBookingApprovals(
        client,
        booking_id,
        allRoomIds
      );


      /* ===================================
         COMMIT
      =================================== */

      await client.query(
        "COMMIT"
      );


      return res.status(201).json({

        message:
          "Accommodation allotted successfully and approval workflow was created.",

        booking: {
          id:
            booking.id,

          booking_reference:
            booking.booking_reference,

          booking_status:
            "ALLOTTED",

          approval_status:
            booking.approval_status,
        },

        allotments:
          createdAllotments,

      });


    } catch (error) {

      await client.query(
        "ROLLBACK"
      );


      console.error(
        "Bulk allotment error:",
        error
      );


      const message =
        error instanceof Error
          ? error.message
          : "Unable to complete allotment.";


      return res.status(400).json({
        message,
      });


    } finally {

      client.release();

    }

  }
);


/* =========================================================
   POST /api/allotments

   SINGLE ALLOTMENT COMPATIBILITY ENDPOINT

   For AC/NAC/VIP:
       bed_id should be NULL.

   For DM/HALL:
       bed_id is required.
========================================================= */

router.post(
  "/",
  async (
    req: Request,
    res: Response
  ) => {

    const {
      booking_id,
      guest_id,
      room_id,
      bed_id = null,
      allotted_by,
      is_emergency_allotment = false,
      remarks = null,
    } = req.body;


    if (
      !booking_id ||
      !guest_id ||
      !room_id ||
      !allotted_by
    ) {

      return res.status(400).json({
        message:
          "booking_id, guest_id, room_id and allotted_by are required.",
      });

    }


    const client =
      await pool.connect();


    try {

      await client.query(
        "BEGIN"
      );


      /* ===================================
         BOOKING
      =================================== */

      const bookingResult =
        await client.query(
          `
          SELECT
            id,
            booking_reference,
            booking_status,
            booking_type,
            approval_status,
            check_in_date,
            expected_check_out_date

          FROM bookings

          WHERE
            id = $1

          FOR UPDATE
          `,
          [
            booking_id,
          ]
        );


      if (
        bookingResult.rowCount === 0
      ) {

        throw new Error(
          "Booking not found."
        );

      }


      const booking =
        bookingResult.rows[0];


      const requestedCheckIn =
        booking.check_in_date;

      const requestedCheckOut =
        booking.expected_check_out_date;


      if (
        !requestedCheckIn ||
        !requestedCheckOut
      ) {

        throw new Error(
          "Booking check-in and check-out dates are required."
        );

      }


      /* ===================================
         USER
      =================================== */

      const userResult =
        await client.query(
          `
          SELECT
            u.id,
            u.is_active,
            r.role_name

          FROM users u

          INNER JOIN roles r
            ON r.id = u.role_id

          WHERE
            u.id = $1
          `,
          [
            allotted_by,
          ]
        );


      if (
        userResult.rowCount === 0
      ) {

        throw new Error(
          "Allotting user was not found."
        );

      }


      const user =
        userResult.rows[0];


      if (
        !user.is_active
      ) {

        throw new Error(
          "The allotting user's account is inactive."
        );

      }


      /* ===================================
         GUEST
      =================================== */

      const guestResult =
        await client.query(
          `
          SELECT
            g.id

          FROM booking_guests bg

          INNER JOIN guests g
            ON g.id = bg.guest_id

          WHERE
            bg.booking_id = $1
            AND bg.guest_id = $2
          `,
          [
            booking_id,
            guest_id,
          ]
        );


      if (
        guestResult.rowCount === 0
      ) {

        throw new Error(
          "Guest does not belong to this booking."
        );

      }


      /* ===================================
         ROOM
      =================================== */

      const roomResult =
        await client.query(
          `
          SELECT
            r.id,
            r.room_number,
            r.room_status,
            r.is_active,
            r.total_beds,
            rc.category_name

          FROM rooms r

          INNER JOIN room_categories rc
            ON rc.id = r.category_id

          WHERE
            r.id = $1

          FOR UPDATE
          `,
          [
            room_id,
          ]
        );


      if (
        roomResult.rowCount === 0
      ) {

        throw new Error(
          "Room not found."
        );

      }


      const room =
        roomResult.rows[0];


      if (
        !room.is_active
      ) {

        throw new Error(
          `Room ${room.room_number} is inactive.`
        );

      }


      const wholeRoom =
        isWholeRoomCategory(
          room.category_name
        );


      /* ===================================
         PERMISSION
      =================================== */

      await verifyRoomPermission(
        client,
        room_id,
        user.role_name,
        Boolean(
          is_emergency_allotment
        )
      );


      /* ===================================
         WHOLE ROOM ALLOTMENT
         AC / VIP / NAC
      =================================== */

      if (
        wholeRoom
      ) {

        if (
          bed_id
        ) {

          throw new Error(
            `Room ${room.room_number} is a whole-room accommodation. Do not select a bed.`
          );

        }


        /* -------------------------------
           DATE CONFLICT
        -------------------------------- */

        const roomConflict =
          await checkRoomDateConflict(
            client,
            room_id,
            booking_id,
            requestedCheckIn,
            requestedCheckOut
          );


        if (
          roomConflict.conflict
        ) {

          throw new Error(
            `Room ${room.room_number} is already allotted to booking ${roomConflict.bookingReference} for ${roomConflict.checkInDate} to ${roomConflict.checkOutDate}.`
          );

        }


        /* -------------------------------
           INSERT ROOM ALLOTMENT
        -------------------------------- */

        const result =
          await client.query(
            `
            INSERT INTO allotments (
              booking_id,
              room_id,
              bed_id,
              guest_id,
              allotted_by,
              allotment_status,
              is_emergency_allotment,
              remarks
            )

            VALUES (
              $1,
              $2,
              NULL,
              $3,
              $4,
              'ALLOTTED',
              $5,
              $6
            )

            RETURNING *
            `,
            [
              booking_id,
              room_id,
              guest_id,
              allotted_by,
              Boolean(
                is_emergency_allotment
              ),
              remarks,
            ]
          );


        /* -------------------------------
           WHOLE ROOM OCCUPIED
        -------------------------------- */

        await client.query(
          `
          UPDATE beds

          SET
            bed_status =
              CASE
                WHEN $2 = 'ADVANCE'
                  THEN 'BOOKED'
                ELSE 'OCCUPIED'
              END

          WHERE
            room_id = $1
            AND is_active = TRUE
          `,
          [
            room_id,
            booking.booking_type,
          ]
        );


        await client.query(
          `
          UPDATE rooms

          SET
            room_status =
              CASE
                WHEN $2 = 'ADVANCE'
                  THEN 'BOOKED'
                ELSE 'OCCUPIED'
              END,
            updated_at = CURRENT_TIMESTAMP

          WHERE
            id = $1
          `,
          [
            room_id,
            booking.booking_type,
          ]
        );


        /* -------------------------------
           BOOKING
        -------------------------------- */

        await client.query(
          `
          UPDATE bookings

          SET
            booking_status = 'ALLOTTED',
            updated_at = CURRENT_TIMESTAMP

          WHERE
            id = $1
          `,
          [
            booking_id,
          ]
        );


        await createBookingApprovals(
          client,
          booking_id,
          [
            room_id,
          ]
        );


        await client.query(
          "COMMIT"
        );


        return res.status(201).json({

          message:
            `Whole room ${room.room_number} allotted successfully.`,

          allotment:
            result.rows[0],

        });

      }


      /* ===================================
         BED-LEVEL ALLOTMENT
         DM / HALL
      =================================== */

      if (
        !bed_id
      ) {

        throw new Error(
          `Room ${room.room_number} requires an exact bed/seat selection.`
        );

      }


      /* ===================================
         LOCK BED
      =================================== */

      const bedResult =
        await client.query(
          `
          SELECT
            b.id,
            b.room_id,
            b.bed_number,
            b.bed_status,
            b.is_active

          FROM beds b

          WHERE
            b.id = $1
            AND b.room_id = $2

          FOR UPDATE
          `,
          [
            bed_id,
            room_id,
          ]
        );


      if (
        bedResult.rowCount === 0
      ) {

        throw new Error(
          "Selected bed does not belong to the selected room."
        );

      }


      const bed =
        bedResult.rows[0];


      if (
        !bed.is_active
      ) {

        throw new Error(
          `Bed ${bed.bed_number} is inactive.`
        );

      }


      if (
        !["AVAILABLE", "BOOKED"].includes(
          String(bed.bed_status).toUpperCase()
        )
      ) {

        throw new Error(
          `Bed ${bed.bed_number} is not available.`
        );

      }


      /* ===================================
         BED DATE CONFLICT
      =================================== */

      const bedConflict =
        await checkBedDateConflict(
          client,
          bed_id,
          booking_id,
          requestedCheckIn,
          requestedCheckOut
        );


      if (
        bedConflict.conflict
      ) {

        throw new Error(
          `Room ${room.room_number}, Bed ${bed.bed_number} is already allotted to booking ${bedConflict.bookingReference} for ${bedConflict.checkInDate} to ${bedConflict.checkOutDate}.`
        );

      }


      /* ===================================
         INSERT BED ALLOTMENT
      =================================== */

      const result =
        await client.query(
          `
          INSERT INTO allotments (
            booking_id,
            room_id,
            bed_id,
            guest_id,
            allotted_by,
            allotment_status,
            is_emergency_allotment,
            remarks
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            'ALLOTTED',
            $6,
            $7
          )

          RETURNING *
          `,
          [
            booking_id,
            room_id,
            bed_id,
            guest_id,
            allotted_by,
            Boolean(
              is_emergency_allotment
            ),
            remarks,
          ]
        );


      /* ===================================
         BED OCCUPIED
      =================================== */

      await client.query(
        `
        UPDATE beds

        SET
          bed_status =
            CASE
              WHEN $2 = 'ADVANCE'
                THEN 'BOOKED'
              ELSE 'OCCUPIED'
            END

        WHERE
          id = $1
        `,
        [
          bed_id,
          booking.booking_type,
        ]
      );


      /* ===================================
         UPDATE ROOM STATUS
      =================================== */

      const availableBeds =
        await client.query(
          `
          SELECT
            COUNT(*) AS count

          FROM beds

          WHERE
            room_id = $1
            AND is_active = TRUE
            AND bed_status = 'AVAILABLE'
          `,
          [
            room_id,
          ]
        );


      const availableCount =
        Number(
          availableBeds.rows[0].count
        );


      await client.query(
        `
        UPDATE rooms

        SET
          room_status =
            CASE
              WHEN $2 = 0 AND $3 = 'ADVANCE'
                THEN 'BOOKED'
              WHEN $2 = 0
                THEN 'OCCUPIED'
              ELSE 'AVAILABLE'
            END,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE
          id = $1
        `,
        [
          room_id,
          availableCount,
          booking.booking_type,
        ]
      );


      /* ===================================
         UPDATE BOOKING
      =================================== */

      await client.query(
        `
        UPDATE bookings

        SET
          booking_status = 'ALLOTTED',
          updated_at = CURRENT_TIMESTAMP

        WHERE
          id = $1
        `,
        [
          booking_id,
        ]
      );


      /* ===================================
         APPROVAL
      =================================== */

      await createBookingApprovals(
        client,
        booking_id,
        [
          room_id,
        ]
      );


      /* ===================================
         COMMIT
      =================================== */

      await client.query(
        "COMMIT"
      );


      return res.status(201).json({

        message:
          `Bed ${bed.bed_number} in room ${room.room_number} allotted successfully.`,

        allotment:
          result.rows[0],

      });


    } catch (error) {

      await client.query(
        "ROLLBACK"
      );


      console.error(
        "Allotment error:",
        error
      );


      const message =
        error instanceof Error
          ? error.message
          : "Unable to allot accommodation.";


      return res.status(400).json({
        message,
      });


    } finally {

      client.release();

    }

  }
);


/* =========================================================
   GET BOOKING ALLOTMENTS
========================================================= */

router.get(
  "/booking/:bookingId",
  async (
    req: Request,
    res: Response
  ) => {

    const {
      bookingId,
    } = req.params;


    try {

      const result =
        await pool.query(
          `
          SELECT
            a.id,
            a.booking_id,
            a.room_id,
            a.bed_id,
            a.guest_id,
            a.allotted_by,
            a.allotment_status,
            a.is_emergency_allotment,
            a.allotted_at,
            a.released_at,
            a.remarks,

            g.guest_name,

            r.room_number,

            b.bed_number,

            rc.category_name

          FROM allotments a

          INNER JOIN guests g
            ON g.id = a.guest_id

          INNER JOIN rooms r
            ON r.id = a.room_id

          LEFT JOIN beds b
            ON b.id = a.bed_id

          INNER JOIN room_categories rc
            ON rc.id = r.category_id

          WHERE
            a.booking_id = $1

          ORDER BY
            r.room_number,
            b.bed_number NULLS FIRST
          `,
          [
            bookingId,
          ]
        );


      return res.json({
        allotments:
          result.rows,
      });


    } catch (error) {

      console.error(
        "Get booking allotments error:",
        error
      );


      return res.status(500).json({
        message:
          "Unable to retrieve booking allotments.",
      });

    }

  }
);


/* =========================================================
   GET CURRENT ALLOTMENTS
========================================================= */

router.get(
  "/current",
  async (
    _req: Request,
    res: Response
  ) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            a.id,
            a.booking_id,
            a.room_id,
            a.bed_id,
            a.guest_id,
            a.allotted_by,
            a.allotment_status,
            a.is_emergency_allotment,
            a.allotted_at,
            a.released_at,
            a.remarks,

            b.bed_number,

            r.room_number,

            rc.category_name,

            g.guest_name,

            bk.booking_reference,

            bk.check_in_date,

            bk.expected_check_out_date

          FROM allotments a

          LEFT JOIN beds b
            ON b.id = a.bed_id

          INNER JOIN rooms r
            ON r.id = a.room_id

          INNER JOIN room_categories rc
            ON rc.id = r.category_id

          INNER JOIN guests g
            ON g.id = a.guest_id

          INNER JOIN bookings bk
            ON bk.id = a.booking_id

          WHERE
            a.allotment_status = 'ALLOTTED'

          ORDER BY
            rc.category_name,
            r.room_number,
            b.bed_number NULLS FIRST
          `
        );


      return res.json({
        allotments:
          result.rows,
      });


    } catch (error) {

      console.error(
        "Get current allotments error:",
        error
      );


      return res.status(500).json({
        message:
          "Unable to retrieve current allotments.",
      });

    }

  }
);
/* =========================================================
   POST /api/allotments/lock

   ROOM LOCK

   APPROVED
      ↓
   PAYMENT
      ↓
   INVOICE
      ↓
   ROOM LOCKED
      ↓
   CHECK-IN

   Uses booking_acceptances as the source of the
   accepted room / bed selection.

   IMPORTANT:
   - Does NOT create approval records.
   - Does NOT use ROOM_LOCKED as allotment_status.
   - Actual allotment_status remains ALLOTTED.
   - AC / NAC / VIP = whole room, bed_id NULL.
   - DM / HALL = selected bed.
========================================================= */

router.post(
  "/lock",
  async (
    req: Request,
    res: Response
  ) => {

    const {
      booking_id,
      allotted_by,
      remarks = null,
    } = req.body;

    if (!booking_id) {
      return res.status(400).json({
        message: "Booking ID is required.",
      });
    }

    if (!allotted_by) {
      return res.status(400).json({
        message: "Allotting user ID is required.",
      });
    }

    const client = await pool.connect();

    try {

      await client.query("BEGIN");

      /* ===================================
         BOOKING
      =================================== */

      const bookingResult =
        await client.query(
          `
          SELECT
            id,
            booking_reference,
            booking_status,
            booking_type,
            approval_status,
            acceptance_status,
            check_in_date,
            expected_check_out_date
          FROM bookings
          WHERE id = $1
          FOR UPDATE
          `,
          [booking_id]
        );

      if (bookingResult.rowCount === 0) {
        throw new Error(
          "Booking not found."
        );
      }

      const booking =
        bookingResult.rows[0];

      /* ===================================
         APPROVAL
      =================================== */

      if (
        booking.approval_status !==
        "APPROVED"
      ) {
        throw new Error(
          "Booking must be approved before room locking."
        );
      }

      /* ===================================
         ACCEPTANCE
      =================================== */

      if (
        booking.acceptance_status !==
        "ACCEPTED"
      ) {
        throw new Error(
          "Booking acceptance must be completed before room locking."
        );
      }

      /* ===================================
         DATES
      =================================== */

      if (
        !booking.check_in_date ||
        !booking.expected_check_out_date
      ) {
        throw new Error(
          "Booking check-in and check-out dates are required."
        );
      }

      if (
        booking.expected_check_out_date <
        booking.check_in_date
      ) {
        throw new Error(
          "Booking check-out date cannot be before check-in date."
        );
      }

      /* ===================================
         USER
      =================================== */

      const userResult =
        await client.query(
          `
          SELECT
            u.id,
            u.full_name,
            u.is_active,
            r.role_name
          FROM users u
          INNER JOIN roles r
            ON r.id = u.role_id
          WHERE u.id = $1
          `,
          [allotted_by]
        );

      if (userResult.rowCount === 0) {
        throw new Error(
          "Allotting user was not found."
        );
      }

      const user =
        userResult.rows[0];

      if (!user.is_active) {
        throw new Error(
          "The allotting user's account is inactive."
        );
      }

      /* ===================================
         PAYMENT
      =================================== */

      const successfulPaymentStatus =
        await getSuccessfulPaymentStatus(
          client
        );

      const paymentResult =
        await client.query(
          `
          SELECT
            id,
            amount,
            payment_status,
            payment_method,
            transaction_number,
            payment_date
          FROM payments
          WHERE
            booking_id = $1
            AND payment_status = $2
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [
            booking_id,
            successfulPaymentStatus,
          ]
        );

      if (paymentResult.rowCount === 0) {
        throw new Error(
          "Successful payment is required before room locking."
        );
      }

      const payment =
        paymentResult.rows[0];

      /* ===================================
         INVOICE
      =================================== */

      const invoiceResult =
        await client.query(
          `
          SELECT
            bi.id,
            bi.invoice_number,
            bi.invoice_type,
            bi.invoice_date,
            bi.amount,
            bi.payment_id
          FROM booking_invoices bi
          INNER JOIN payments p
            ON p.id = bi.payment_id
           AND p.booking_id = bi.booking_id
          WHERE
            bi.booking_id = $1
            AND p.id = $2
            AND p.payment_status = $3
          ORDER BY bi.created_at DESC
          LIMIT 1
          `,
          [
            booking_id,
            payment.id,
            successfulPaymentStatus,
          ]
        );

      if (invoiceResult.rowCount === 0) {
        throw new Error(
          "Invoice must be generated before room locking."
        );
      }

      const invoice =
        invoiceResult.rows[0];

      if (
        Number(invoice.amount) <= 0 ||
        Number(invoice.amount) >
          Number(payment.amount)
      ) {
        throw new Error(
          "The invoice must be valid and cannot exceed its successful payment."
        );
      }

      /* ===================================
         ACCEPTED ACCOMMODATION
      =================================== */

      const acceptanceResult =
        await client.query(
          `
          SELECT
            ba.id,
            ba.booking_id,
            ba.guest_id,
            ba.room_id,
            ba.bed_id,
            ba.acceptance_status,

            g.guest_name,

            r.room_number,
            r.room_status,
            r.is_active,

            rc.category_name

          FROM booking_acceptances ba

          INNER JOIN guests g
            ON g.id = ba.guest_id

          INNER JOIN rooms r
            ON r.id = ba.room_id

          INNER JOIN room_categories rc
            ON rc.id = r.category_id

          WHERE
            ba.booking_id = $1
            AND ba.acceptance_status = 'ACCEPTED'

          ORDER BY
            r.room_number,
            g.guest_name
          `,
          [booking_id]
        );

      if (
        acceptanceResult.rowCount === 0
      ) {
        throw new Error(
          "No accepted room/bed selection was found."
        );
      }

      /* ===================================
         ALL ACCEPTANCE RECORDS MUST BE
         ACCEPTED
      =================================== */

      const pendingAcceptanceResult =
        await client.query(
          `
          SELECT
            COUNT(*) AS count
          FROM booking_acceptances
          WHERE
            booking_id = $1
            AND acceptance_status <> 'ACCEPTED'
          `,
          [booking_id]
        );

      const pendingAcceptanceCount =
        Number(
          pendingAcceptanceResult
            .rows[0]
            .count
        );

      if (
        pendingAcceptanceCount > 0
      ) {
        throw new Error(
          "All accommodation acceptance records must be accepted before room locking."
        );
      }

      /* ===================================
         DUPLICATE LOCK
      =================================== */

      const existingAllotmentResult =
        await client.query(
          `
          SELECT
            id
          FROM allotments
          WHERE
            booking_id = $1
            AND allotment_status = 'ALLOTTED'
          LIMIT 1
          `,
          [booking_id]
        );

      if (
        existingAllotmentResult.rowCount &&
        existingAllotmentResult.rowCount > 0
      ) {
        throw new Error(
          "Accommodation is already locked for this booking."
        );
      }

      const createdAllotments: unknown[] = [];

      const processedRooms =
        new Set<string>();

      const processedBeds =
        new Set<string>();

      /* ===================================
         PROCESS ACCEPTED SELECTIONS
      =================================== */

      for (
        const acceptance
        of acceptanceResult.rows
      ) {

        const roomId =
          acceptance.room_id;

        const bedId =
          acceptance.bed_id;

        const guestId =
          acceptance.guest_id;

        /* =================================
           ROOM
        ================================= */

        const roomResult =
          await client.query(
            `
            SELECT
              r.id,
              r.room_number,
              r.room_status,
              r.is_active,
              r.total_beds,
              rc.category_name

            FROM rooms r

            INNER JOIN room_categories rc
              ON rc.id = r.category_id

            WHERE r.id = $1

            FOR UPDATE
            `,
            [roomId]
          );

        if (
          roomResult.rowCount === 0
        ) {
          throw new Error(
            "Selected room was not found."
          );
        }

        const room =
          roomResult.rows[0];

        if (!room.is_active) {
          throw new Error(
            `Room ${room.room_number} is inactive.`
          );
        }

        const wholeRoom =
          isWholeRoomCategory(
            room.category_name
          );

        /* =================================
           WHOLE ROOM
           AC / NAC / VIP
        ================================= */

        if (wholeRoom) {

          if (bedId) {
            throw new Error(
              `Room ${room.room_number} is a whole-room accommodation. Bed selection is not allowed.`
            );
          }

          if (
            processedRooms.has(roomId)
          ) {
            continue;
          }

          processedRooms.add(roomId);

          /* -------------------------------
             DATE CONFLICT
          -------------------------------- */

          const roomConflict =
            await checkRoomDateConflict(
              client,
              roomId,
              booking_id,
              booking.check_in_date,
              booking.expected_check_out_date
            );

          if (
            roomConflict.conflict
          ) {
            throw new Error(
              `Room ${room.room_number} is already allotted to booking ${roomConflict.bookingReference} for ${roomConflict.checkInDate} to ${roomConflict.checkOutDate}.`
            );
          }

          /* -------------------------------
             GET ACCEPTED GUESTS FOR ROOM
          -------------------------------- */

          const roomGuestsResult =
            await client.query(
              `
              SELECT
                guest_id
              FROM booking_acceptances
              WHERE
                booking_id = $1
                AND room_id = $2
                AND bed_id IS NULL
                AND acceptance_status = 'ACCEPTED'
              ORDER BY created_at
              `,
              [
                booking_id,
                roomId,
              ]
            );

          if (
            roomGuestsResult.rowCount === 0
          ) {
            throw new Error(
              `No accepted guest found for room ${room.room_number}.`
            );
          }

          /* -------------------------------
             CREATE ALLOTMENT PER GUEST
          -------------------------------- */

          for (
            const roomGuest
            of roomGuestsResult.rows
          ) {

            const result =
              await client.query(
                `
                INSERT INTO allotments (
                  booking_id,
                  room_id,
                  bed_id,
                  guest_id,
                  allotted_by,
                  allotment_status,
                  is_emergency_allotment,
                  remarks
                )

                VALUES (
                  $1,
                  $2,
                  NULL,
                  $3,
                  $4,
                  'ALLOTTED',
                  FALSE,
                  $5
                )

                RETURNING
                  id,
                  booking_id,
                  room_id,
                  bed_id,
                  guest_id,
                  allotted_by,
                  allotment_status,
                  is_emergency_allotment,
                  allotted_at,
                  released_at,
                  remarks
                `,
                [
                  booking_id,
                  roomId,
                  roomGuest.guest_id,
                  allotted_by,
                  remarks,
                ]
              );

            createdAllotments.push(
              result.rows[0]
            );
          }

          /* -------------------------------
             RESERVE ROOM

             BOOKED now.
             OCCUPIED will be handled
             by Check-In.
          -------------------------------- */

          await client.query(
            `
            UPDATE beds
            SET
              bed_status = 'BOOKED'
            WHERE
              room_id = $1
              AND is_active = TRUE
            `,
            [roomId]
          );

          await client.query(
            `
            UPDATE rooms
            SET
              room_status = 'BOOKED',
              updated_at =
                CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [roomId]
          );

          continue;
        }

        /* =================================
           BED LEVEL
           DM / HALL
        ================================= */

        if (!bedId) {
          throw new Error(
            `Room ${room.room_number} requires an exact bed/seat selection.`
          );
        }

        if (
          processedBeds.has(bedId)
        ) {
          continue;
        }

        processedBeds.add(bedId);

        /* -------------------------------
           BED
        -------------------------------- */

        const bedResult =
          await client.query(
            `
            SELECT
              id,
              room_id,
              bed_number,
              bed_status,
              is_active

            FROM beds

            WHERE
              id = $1
              AND room_id = $2

            FOR UPDATE
            `,
            [
              bedId,
              roomId,
            ]
          );

        if (
          bedResult.rowCount === 0
        ) {
          throw new Error(
            `Selected bed does not belong to room ${room.room_number}.`
          );
        }

        const bed =
          bedResult.rows[0];

        if (!bed.is_active) {
          throw new Error(
            `Bed ${bed.bed_number} in room ${room.room_number} is inactive.`
          );
        }

        if (
          !["AVAILABLE", "BOOKED"].includes(
            String(bed.bed_status).toUpperCase()
          )
        ) {
          throw new Error(
            `Bed ${bed.bed_number} in room ${room.room_number} is not available.`
          );
        }

        /* -------------------------------
           DATE CONFLICT
        -------------------------------- */

        const bedConflict =
          await checkBedDateConflict(
            client,
            bedId,
            booking_id,
            booking.check_in_date,
            booking.expected_check_out_date
          );

        if (
          bedConflict.conflict
        ) {
          throw new Error(
            `Room ${room.room_number}, Bed ${bed.bed_number} is already allotted to booking ${bedConflict.bookingReference} for ${bedConflict.checkInDate} to ${bedConflict.checkOutDate}.`
          );
        }

        /* -------------------------------
           CREATE ALLOTMENT
        -------------------------------- */

        const result =
          await client.query(
            `
            INSERT INTO allotments (
              booking_id,
              room_id,
              bed_id,
              guest_id,
              allotted_by,
              allotment_status,
              is_emergency_allotment,
              remarks
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              'ALLOTTED',
              FALSE,
              $6
            )

            RETURNING
              id,
              booking_id,
              room_id,
              bed_id,
              guest_id,
              allotted_by,
              allotment_status,
              is_emergency_allotment,
              allotted_at,
              released_at,
              remarks
            `,
            [
              booking_id,
              roomId,
              bedId,
              guestId,
              allotted_by,
              remarks,
            ]
          );

        createdAllotments.push(
          result.rows[0]
        );

        /* -------------------------------
           RESERVE BED
        -------------------------------- */

        await client.query(
          `
          UPDATE beds
          SET
            bed_status = 'BOOKED'
          WHERE id = $1
          `,
          [bedId]
        );

        /* -------------------------------
           UPDATE ROOM STATUS
        -------------------------------- */

        const availableBedsResult =
          await client.query(
            `
            SELECT
              COUNT(*) AS count
            FROM beds
            WHERE
              room_id = $1
              AND is_active = TRUE
              AND bed_status = 'AVAILABLE'
            `,
            [roomId]
          );

        const availableCount =
          Number(
            availableBedsResult
              .rows[0]
              .count
          );

        await client.query(
          `
          UPDATE rooms
          SET
            room_status =
              CASE
                WHEN $2 = 0
                  THEN 'BOOKED'
                ELSE 'AVAILABLE'
              END,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $1
          `,
          [
            roomId,
            availableCount,
          ]
        );
      }

      /* ===================================
         FINAL VALIDATION
      =================================== */

      if (
        createdAllotments.length === 0
      ) {
        throw new Error(
          "No room/bed allotment was created."
        );
      }

      /* ===================================
         BOOKING STATUS
      =================================== */

      await client.query(
        `
        UPDATE bookings
        SET
          booking_status = 'ALLOTTED',
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = $1
        `,
        [booking_id]
      );

      /* ===================================
         COMMIT
      =================================== */

      await client.query(
        "COMMIT"
      );

      return res.status(201).json({

        message:
          "Room/bed locked successfully. Booking is ready for Check-In.",

        booking: {
          id:
            booking.id,

          booking_reference:
            booking.booking_reference,

          booking_status:
            "ALLOTTED",

          approval_status:
            booking.approval_status,

          acceptance_status:
            booking.acceptance_status,
        },

        payment: {
          id:
            payment.id,

          amount:
            payment.amount,

          payment_status:
            payment.payment_status,
        },

        invoice: {
          id:
            invoice.id,

          invoice_number:
            invoice.invoice_number,

          invoice_type:
            invoice.invoice_type,

          amount:
            invoice.amount,
        },

        allotments:
          createdAllotments,

        next_stage:
          "CHECK_IN",
      });

    } catch (error) {

      await client.query(
        "ROLLBACK"
      );

      console.error(
        "Room lock error:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : "Unable to lock room/bed.";

      return res.status(400).json({
        message,
      });

    } finally {

      client.release();

    }

  }
);
export default router;