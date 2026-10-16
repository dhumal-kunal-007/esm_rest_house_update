import express, { Request, Response } from "express";
import { pool } from "../config/db.js";
import { validateLegacyBillRateOverride } from "../services/legacyBillRateValidation.js";

const router = express.Router();

/*
=========================================================
BILL GENERATION
POST /api/bills/generate
=========================================================
*/

router.post(
  "/generate",
  async (req: Request, res: Response): Promise<void> => {
    const {
      booking_id,
      guest_id,
      check_out_id,
      generated_by,
      additional_person_count,
      other_relation_count,
    } = req.body;

    if (
      !booking_id ||
      !guest_id ||
      !check_out_id ||
      !generated_by
    ) {
      res.status(400).json({
        message:
          "booking_id, guest_id, check_out_id and generated_by are required.",
      });
      return;
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
      =====================================================
      1. GET CHECKOUT DETAILS
      =====================================================

      IMPORTANT:
      beds is LEFT JOIN because AC/NAC/AC VIP
      room-level allotments can have NULL bed_id.
      =====================================================
      */

      const checkoutResult = await client.query(
        `
        SELECT
          co.id AS check_out_id,
          co.booking_id,
          co.guest_id,
          co.check_out_time,
          co.checked_out_by,

          b.booking_reference,
          b.check_in_date,
          b.expected_check_out_date,
          b.booking_type,
          b.booking_status,
          b.approval_status,
          sm.full_name AS booking_person_name,
          (
            SELECT string_agg(DISTINCT booking_guest.guest_name, ', ' ORDER BY booking_guest.guest_name)
            FROM booking_guests bg
            INNER JOIN guests booking_guest ON booking_guest.id = bg.guest_id
            WHERE bg.booking_id = b.id
          ) AS booking_guest_names,
          bp.guest_type AS priced_guest_type,
          bp.accommodation_category AS priced_category,
          bp.accommodation_rate AS priced_accommodation_rate,
          legacy_rate.daily_rate AS legacy_daily_rate,
          legacy_rate.guest_type AS legacy_guest_type,
          legacy_rate.accommodation_category AS legacy_category,
          legacy_rate.authorization_reason AS legacy_authorization_reason,
          legacy_rate.authorized_by AS legacy_authorized_by,
          legacy_rate.authorized_at AS legacy_authorized_at,

          g.guest_name,
          g.gender,
          g.mobile_number,
          g.email,
          g.address,
          g.identity_type,
          g.identity_number,
          g.designation,
          g.department,
          g.organization,
          g.rank,

          a.id AS allotment_id,
          a.room_id,
          a.bed_id,
          a.allotment_status,
          card.esm_room_rate AS rate_card_esm_rate,
          card.serving_room_rate AS rate_card_serving_rate,
          card.civilian_room_rate AS rate_card_civilian_rate,

          (
            SELECT string_agg(DISTINCT billing_room.room_number, ', ' ORDER BY billing_room.room_number)
            FROM allotments booking_allotment
            INNER JOIN rooms billing_room
              ON billing_room.id = booking_allotment.room_id
            INNER JOIN check_ins billing_check_in
              ON billing_check_in.allotment_id = booking_allotment.id
            WHERE booking_allotment.booking_id = b.id
          ) AS room_number,
          r.total_beds,

          rc.category_name,

          bd.bed_number

        FROM check_outs co

        INNER JOIN bookings b
          ON b.id = co.booking_id

        LEFT JOIN booking_service_members sm
          ON sm.booking_id = b.id

        LEFT JOIN booking_pricing bp
          ON bp.booking_id = b.id

        INNER JOIN guests g
          ON g.id = co.guest_id

        INNER JOIN allotments a
          ON a.id = co.allotment_id

        INNER JOIN rooms r
          ON r.id = a.room_id

        INNER JOIN room_categories rc
          ON rc.id = r.category_id

        LEFT JOIN beds bd
          ON bd.id = a.bed_id

        LEFT JOIN room_rate_cards card
          ON card.room_id = a.room_id

        LEFT JOIN booking_legacy_bill_rates legacy_rate
          ON legacy_rate.booking_id = b.id
         AND legacy_rate.room_id = a.room_id

        WHERE
          co.id = $1
          AND co.booking_id = $2
          AND co.guest_id = $3

        LIMIT 1
        FOR UPDATE OF co
        `,
        [
          check_out_id,
          booking_id,
          guest_id,
        ]
      );

      if (checkoutResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          message:
            "Checkout record was not found.",
        });

        return;
      }

      const checkout =
        checkoutResult.rows[0];

      if (checkout.booking_status !== "CHECKED_OUT") {
        await client.query("ROLLBACK");
        res.status(409).json({
          message: "The booking-level final bill can be generated only after all checked-in guests have checked out.",
        });
        return;
      }

      await client.query(
        "SELECT id FROM bookings WHERE id = $1 FOR UPDATE",
        [booking_id]
      );

      const existingBillResult =
        await client.query(
          `
          SELECT
            id,
            bill_number,
            bill_date,
            room_charges,
            food_charges,
            other_charges,
            discount_amount,
            total_amount,
            payment_status,
            payment_method,
            created_at

          FROM bills

          WHERE booking_id = $1
             OR check_out_id = $2

          LIMIT 1
          `,
          [booking_id, check_out_id]
        );

      if (existingBillResult.rows.length > 0) {
        await client.query("ROLLBACK");

        res.status(200).json({
          message: "A bill already exists for this check-out.",
          bill: existingBillResult.rows[0],
        });

        return;
      }

      const hasPricingSnapshot =
        Boolean(checkout.priced_guest_type) &&
        checkout.priced_accommodation_rate !== null;

      if (
        !hasPricingSnapshot &&
        checkout.legacy_daily_rate !== null
      ) {
        checkout.priced_guest_type =
          checkout.legacy_guest_type;
        checkout.priced_accommodation_rate =
          checkout.legacy_daily_rate;
        checkout.priced_category =
          checkout.legacy_category;
      } else if (!hasPricingSnapshot) {
        const validation = validateLegacyBillRateOverride({
          legacyDailyRate: req.body.legacy_daily_rate,
          legacyGuestType: req.body.legacy_guest_type,
          legacyAuthorizationReason: req.body.legacy_authorization_reason,
          confirmLegacyRate: req.body.confirm_legacy_rate,
          userRole: req.authUser?.role,
        });

        if (validation.isRequired) {
          await client.query("ROLLBACK");
          res.status(409).json({
            code: "LEGACY_PRICING_REQUIRED",
            message: validation.error,
            rate_card_rates: {
              ESM: checkout.rate_card_esm_rate,
              SERVING: checkout.rate_card_serving_rate,
              CIVILIAN: checkout.rate_card_civilian_rate,
            },
          });
          return;
        }

        if (!validation.isValid) {
          await client.query("ROLLBACK");
          res.status(
            req.authUser?.role === "ADMIN" ? 400 : 403
          ).json({
            message: validation.error,
          });
          return;
        }

        const legacyRate = validation.normalizedRate!;
        const legacyGuestType = validation.normalizedGuestType!;
        const authorizationReason = validation.normalizedAuthorizationReason!;

        await client.query(
          `
          INSERT INTO booking_legacy_bill_rates (
            booking_id,
            room_id,
            daily_rate,
            guest_type,
            accommodation_category,
            authorization_reason,
            authorized_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [
            checkout.booking_id,
            checkout.room_id,
            legacyRate,
            legacyGuestType,
            String(checkout.category_name).toUpperCase(),
            authorizationReason,
            req.authUser!.id,
          ]
        );

        checkout.priced_guest_type = legacyGuestType;
        checkout.priced_accommodation_rate = legacyRate;
        checkout.priced_category =
          String(checkout.category_name).toUpperCase();
        checkout.legacy_authorization_reason =
          authorizationReason;
        checkout.legacy_authorized_by =
          req.authUser!.id;
        checkout.legacy_authorized_at =
          new Date().toISOString();
      }

      /*
      =====================================================
      3. VERIFY BILL GENERATOR
      =====================================================
      */

      const userResult =
        await client.query(
          `
          SELECT
            id,
            full_name,
            is_active

          FROM users

          WHERE id = $1

          LIMIT 1
          `,
          [generated_by]
        );

      if (userResult.rows.length === 0) {
        await client.query("ROLLBACK");

        res.status(404).json({
          message:
            "Bill generating user was not found.",
        });

        return;
      }

      if (
        !userResult.rows[0].is_active
      ) {
        await client.query("ROLLBACK");

        res.status(403).json({
          message:
            "The bill generating user is inactive.",
        });

        return;
      }

      /*
      =====================================================
      4. CALCULATE STAY DAYS
      =====================================================
      */

      const checkInDate =
        new Date(
          checkout.check_in_date
        );

      const checkOutDate =
        new Date(
          checkout.check_out_time
        );

      checkInDate.setHours(
        0,
        0,
        0,
        0
      );

      checkOutDate.setHours(
        0,
        0,
        0,
        0
      );

      const millisecondsPerDay =
        1000 * 60 * 60 * 24;

      let stayDays = Math.ceil(
        (
          checkOutDate.getTime() -
          checkInDate.getTime()
        ) / millisecondsPerDay
      );

      if (stayDays < 1) {
        stayDays = 1;
      }

      /*
      =====================================================
      5. ADDITIONAL MEMBERS
      =====================================================
      */

      const additionalPersonCount =
        Math.max(
          0,
          Number(
            additional_person_count || 0
          )
        );

      const otherRelationCount =
        Math.max(
          0,
          Number(
            other_relation_count || 0
          )
        );

      if (
        otherRelationCount >
        additionalPersonCount
      ) {
        await client.query("ROLLBACK");

        res.status(400).json({
          message:
            "Other relation count cannot be greater than additional person count.",
        });

        return;
      }

      const guestType =
        String(checkout.priced_guest_type).toUpperCase();
      const accommodationType =
        String(checkout.priced_category).toUpperCase();
      const isServing =
        guestType === "SERVING";

      if (
        !["ESM", "SERVING", "CIVILIAN"].includes(guestType)
      ) {
        throw new Error(
          "The booking pricing snapshot has an unsupported guest type."
        );
      }

      const accommodationRate =
        Number(checkout.priced_accommodation_rate);

      if (
        !Number.isFinite(accommodationRate) ||
        accommodationRate <= 0
      ) {
        throw new Error(
          "The booking pricing snapshot has an invalid accommodation rate."
        );
      }

      /*
      =====================================================
      9. ROOM / BED CHARGES
      =====================================================
      */

      const accommodationUsageResult = await client.query(
        `
        WITH unit_stays AS (
          SELECT
            CASE
              WHEN a.bed_id IS NULL THEN 'ROOM:' || a.room_id::text
              ELSE 'BED:' || a.bed_id::text
            END AS unit_key,
            a.room_id,
            a.bed_id,
            MIN(ci.check_in_time AT TIME ZONE 'Asia/Kolkata')::date AS check_in_date,
            MAX(co.check_out_time AT TIME ZONE 'Asia/Kolkata')::date AS check_out_date,
            MAX(
              COALESCE(
                legacy_rate.daily_rate,
                CASE
                  WHEN a.bed_id IS NOT NULL
                       AND UPPER(COALESCE(bg.relationship, 'OTHER')) <> 'SELF'
                    THEN card.civilian_room_rate
                  WHEN UPPER(bp.guest_type) = 'ESM'
                    THEN card.esm_room_rate
                  WHEN UPPER(bp.guest_type) = 'SERVING'
                    THEN card.serving_room_rate
                  WHEN UPPER(bp.guest_type) = 'CIVILIAN'
                    THEN card.civilian_room_rate
                END
              )
            ) AS daily_rate
          FROM allotments a
          INNER JOIN check_ins ci ON ci.allotment_id = a.id
          INNER JOIN check_outs co ON co.allotment_id = a.id
          LEFT JOIN booking_pricing bp ON bp.booking_id = a.booking_id
          LEFT JOIN booking_guests bg
            ON bg.booking_id = a.booking_id
           AND bg.guest_id = a.guest_id
          LEFT JOIN room_rate_cards card ON card.room_id = a.room_id
          LEFT JOIN booking_legacy_bill_rates legacy_rate
            ON legacy_rate.booking_id = a.booking_id
           AND legacy_rate.room_id = a.room_id
          WHERE a.booking_id = $1
          GROUP BY 1, a.room_id, a.bed_id
        )
        SELECT
          COUNT(*)::INTEGER AS accommodation_units,
          COALESCE(SUM(GREATEST(1, check_out_date - check_in_date)), 0)::INTEGER
            AS accommodation_unit_days,
          COUNT(*) FILTER (
            WHERE daily_rate IS NULL OR daily_rate <= 0
          )::INTEGER AS invalid_rate_units,
          COALESCE(
            SUM(GREATEST(1, check_out_date - check_in_date) * daily_rate),
            0
          )::NUMERIC AS room_charges
        FROM unit_stays
        `,
        [booking_id]
      );
      const accommodationUnits = Number(
        accommodationUsageResult.rows[0].accommodation_units
      );
      const accommodationUnitDays = Number(
        accommodationUsageResult.rows[0].accommodation_unit_days
      );
      const roomCharges = Number(
        accommodationUsageResult.rows[0].room_charges
      );
      const invalidRateUnits = Number(
        accommodationUsageResult.rows[0].invalid_rate_units
      );
      if (
        !Number.isSafeInteger(accommodationUnits) ||
        accommodationUnits < 1 ||
        !Number.isSafeInteger(accommodationUnitDays) ||
        accommodationUnitDays < 1 ||
        invalidRateUnits > 0 ||
        !Number.isFinite(roomCharges) ||
        roomCharges <= 0
      ) {
        throw new Error(
          invalidRateUnits > 0
            ? "A checked-in accommodation unit is missing a valid daily rate."
            : "No checked-in accommodation units were found for this booking."
        );
      }
      const billedAverageRate =
        roomCharges / accommodationUnitDays;

      /*
      =====================================================
      10. ADDITIONAL PERSON CHARGES
      =====================================================
      */

      const normalAdditionalCount =
        additionalPersonCount -
        otherRelationCount;

      const additionalPersonRate =
        guestType === "ESM" ? 80 : 100;

      const otherRelationRate = 150;

      const additionalPersonCharges =
        normalAdditionalCount *
        additionalPersonRate;

      const otherRelationCharges =
        otherRelationCount *
        otherRelationRate;

      const otherCharges =
        additionalPersonCharges +
        otherRelationCharges;

      /*
      =====================================================
      11. FOOD
      =====================================================
      */

      const foodCharges = 0;

      /*
      =====================================================
      12. DISCOUNT
      =====================================================
      */

      const discountAmount = 0;

      /*
      =====================================================
      13. TOTAL
      =====================================================
      */

      const totalAmount =
        roomCharges +
        foodCharges +
        otherCharges -
        discountAmount;

      /*
      =====================================================
      14. BILL NUMBER

      EXISTING FUNCTION IS PRESERVED.

      FORMAT:
      MMDD + 4 DIGIT SEQUENCE
      =====================================================
      */

      const billNumberResult =
        await client.query(
          `
          SELECT
            generate_bill_number(
              $1::DATE
            ) AS bill_number
          `,
          [
            checkout.check_out_time,
          ]
        );

      const billNumber =
        billNumberResult.rows[0]
          .bill_number;

      /*
      =====================================================
      15. INSERT BILL
      =====================================================
      */

      const billInsertResult =
        await client.query(
          `
          INSERT INTO bills (
            booking_id,
            guest_id,
            check_out_id,
            bill_number,
            bill_date,
            room_charges,
            food_charges,
            other_charges,
            discount_amount,
            total_amount,
            payment_status,
            payment_method,
            generated_by
          )

          VALUES (
            $1,
            $2,
            $3,
            $4,
            CURRENT_DATE,
            $5,
            $6,
            $7,
            $8,
            $9,
            'PENDING',
            NULL,
            $10
          )

          RETURNING
            id,
            booking_id,
            guest_id,
            check_out_id,
            bill_number,
            bill_date,
            room_charges,
            food_charges,
            other_charges,
            discount_amount,
            total_amount,
            payment_status,
            payment_method,
            generated_by,
            created_at
          `,
          [
            booking_id,
            guest_id,
            check_out_id,
            billNumber,
            roomCharges,
            foodCharges,
            otherCharges,
            discountAmount,
            totalAmount,
            generated_by,
          ]
        );

      await client.query("COMMIT");

      /*
      =====================================================
      16. RESPONSE
      =====================================================
      */

      res.status(201).json({
        message:
          "Bill generated successfully.",

        bill:
          billInsertResult.rows[0],

        details: {
          pricing_source:
            checkout.legacy_authorized_by
              ? "ADMIN_AUTHORIZED_LEGACY_RATE"
              : "BOOKING_PRICING_SNAPSHOT",

          legacy_daily_rate:
            checkout.legacy_authorized_by
              ? Number(checkout.priced_accommodation_rate)
              : null,

          legacy_authorization_reason:
            checkout.legacy_authorization_reason ?? null,

          legacy_authorized_by:
            checkout.legacy_authorized_by ?? null,

          legacy_authorized_at:
            checkout.legacy_authorized_at ?? null,

          booking_reference:
            checkout.booking_reference,

          booking_person_name:
            checkout.booking_person_name,

          booking_guest_names:
            checkout.booking_guest_names,

          guest_name:
            checkout.guest_name,

          mobile_number:
            checkout.mobile_number,

          room_number:
            checkout.room_number,

          bed_number:
            checkout.bed_number,

          accommodation_type:
            accommodationType,

          category_name:
            checkout.category_name,

          is_serving:
            isServing,

          stay_days:
            stayDays,

          accommodation_rate:
            billedAverageRate,

          accommodation_units:
            accommodationUnits,

          accommodation_unit_days:
            accommodationUnitDays,
          room_charges:
            roomCharges,

          additional_person_count:
            additionalPersonCount,

          additional_person_rate:
            additionalPersonRate,

          additional_person_charges:
            additionalPersonCharges,

          other_relation_count:
            otherRelationCount,

          other_relation_rate:
            otherRelationRate,

          other_relation_charges:
            otherRelationCharges,

          food_charges:
            foodCharges,

          discount_amount:
            discountAmount,

          total_amount:
            totalAmount,
        },

        guest: {
          guest_name:
            checkout.guest_name,

          gender:
            checkout.gender,

          mobile_number:
            checkout.mobile_number,

          email:
            checkout.email,

          address:
            checkout.address,

          identity_type:
            checkout.identity_type,

          identity_number:
            checkout.identity_number,

          designation:
            checkout.designation,

          department:
            checkout.department,

          organization:
            checkout.organization,

          rank:
            checkout.rank,
        },

        stay: {
          check_in_date:
            checkout.check_in_date,

          check_out_time:
            checkout.check_out_time,

          stay_days:
            stayDays,
        },

        accommodation: {
          room_number:
            checkout.room_number,

          bed_number:
            checkout.bed_number,

          category:
            checkout.category_name,

          type:
            accommodationType,
        },
      });
    } catch (error) {
      await client.query("ROLLBACK");

      console.error(
        "Error generating bill:",
        error
      );

      res.status(500).json({
        message:
          "Failed to generate bill.",
      });
    } finally {
      client.release();
    }
  }
);

/*
=========================================================
GET BILL BY ID
GET /api/bills/:id
=========================================================
*/

router.get(
  "/:id",
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { id } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            bl.id,
            bl.booking_id,
            bl.guest_id,
            bl.check_out_id,
            bl.bill_number,
            bl.bill_date,
            bl.room_charges,
            bl.food_charges,
            bl.other_charges,
            bl.discount_amount,
            bl.total_amount,
            bl.payment_status,
            bl.payment_method,
            bl.generated_by,
            bl.created_at,

            b.booking_reference,
            b.check_in_date,
            b.expected_check_out_date,

            g.guest_name,
            g.mobile_number,
            g.email,
            g.address,
            g.identity_type,
            g.identity_number,
            g.designation,
            g.department,
            g.organization,
            g.rank,

            co.check_out_time,

            u.full_name AS generated_by_name

          FROM bills bl

          INNER JOIN bookings b
            ON b.id = bl.booking_id

          INNER JOIN guests g
            ON g.id = bl.guest_id

          INNER JOIN check_outs co
            ON co.id = bl.check_out_id

          INNER JOIN users u
            ON u.id = bl.generated_by

          WHERE bl.id = $1

          LIMIT 1
          `,
          [id]
        );

      if (result.rows.length === 0) {
        res.status(404).json({
          message:
            "Bill not found.",
        });

        return;
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error(
        "Error loading bill:",
        error
      );

      res.status(500).json({
        message:
          "Failed to load bill.",
      });
    }
  }
);

/*
=========================================================
GET ALL BILLS
GET /api/bills
=========================================================
*/

router.get(
  "/",
  async (
    _req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            bl.id,
            bl.bill_number,
            bl.bill_date,
            bl.room_charges,
            bl.food_charges,
            bl.other_charges,
            bl.discount_amount,
            bl.total_amount,
            bl.payment_status,
            bl.payment_method,
            bl.created_at,

            b.booking_reference,

            g.guest_name,
            g.mobile_number,

            u.full_name AS generated_by_name

          FROM bills bl

          INNER JOIN bookings b
            ON b.id = bl.booking_id

          INNER JOIN guests g
            ON g.id = bl.guest_id

          INNER JOIN users u
            ON u.id = bl.generated_by

          ORDER BY
            bl.created_at DESC
          `
        );

      res.json(result.rows);
    } catch (error) {
      console.error(
        "Error loading bills:",
        error
      );

      res.status(500).json({
        message:
          "Failed to load bills.",
      });
    }
  }
);

export default router;