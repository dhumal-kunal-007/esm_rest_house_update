BEGIN;

ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS gender_restriction TEXT NOT NULL DEFAULT 'ANY',
    ADD COLUMN IF NOT EXISTS room_note TEXT;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'rooms_gender_restriction_check'
          AND conrelid = 'public.rooms'::regclass
    ) THEN
        ALTER TABLE public.rooms
            ADD CONSTRAINT rooms_gender_restriction_check
            CHECK (gender_restriction IN ('ANY', 'MALE', 'FEMALE'));
    END IF;
END;
$migration$;

CREATE TEMP TABLE desired_room_inventory (
    room_number TEXT PRIMARY KEY,
    category_name TEXT NOT NULL,
    total_beds INTEGER NOT NULL CHECK (total_beds >= 0),
    gender_restriction TEXT NOT NULL CHECK (
        gender_restriction IN ('ANY', 'MALE', 'FEMALE')
    ),
    is_bookable BOOLEAN NOT NULL,
    room_note TEXT
) ON COMMIT DROP;

INSERT INTO desired_room_inventory (
    room_number,
    category_name,
    total_beds,
    gender_restriction,
    is_bookable,
    room_note
)
VALUES
    ('AC 1', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 2', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 3', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 4', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 5', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 11', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 12', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 13', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 14', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 15', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 16', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 17', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 18', 'AC', 3, 'ANY', TRUE, NULL),
    ('AC 19', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 20', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 21', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 24', 'AC', 2, 'ANY', TRUE, NULL),
    ('AC 22', 'VIP', 4, 'ANY', TRUE, NULL),
    ('AC 23', 'VIP', 4, 'ANY', TRUE, NULL),
    ('NAC 1', 'NON_AC', 3, 'ANY', TRUE, NULL),
    ('NAC 2', 'NON_AC', 3, 'ANY', TRUE, NULL),
    ('NAC 3', 'NON_AC', 3, 'ANY', TRUE, NULL),
    ('NAC 4', 'NON_AC', 3, 'ANY', TRUE, NULL),
    ('NAC 6', 'NON_AC', 2, 'ANY', TRUE, NULL),
    ('NAC 7', 'NON_AC', 2, 'ANY', TRUE, NULL),
    ('NAC 8', 'NON_AC', 2, 'ANY', TRUE, NULL),
    ('DM 1', 'DORMITORY', 12, 'MALE', TRUE, NULL),
    ('DM 2', 'DORMITORY', 12, 'MALE', TRUE, NULL),
    ('DM 3', 'DORMITORY', 12, 'MALE', TRUE, NULL),
    ('DM 4', 'DORMITORY', 12, 'FEMALE', TRUE, NULL),
    ('DM 5', 'DORMITORY', 12, 'FEMALE', TRUE, NULL),
    ('DM 6', 'DORMITORY', 11, 'FEMALE', TRUE, NULL),
    ('DM 7', 'DORMITORY', 12, 'MALE', TRUE, NULL),
    ('DM 8', 'DORMITORY', 12, 'MALE', TRUE, NULL),
    ('DM 9', 'DORMITORY', 12, 'FEMALE', TRUE, NULL),
    ('DM 10', 'DORMITORY', 10, 'ANY', TRUE, NULL),
    ('DM 11', 'DORMITORY', 3, 'FEMALE', TRUE, NULL),
    ('DM 12', 'DORMITORY', 4, 'FEMALE', TRUE, NULL),
    ('DM 13', 'DORMITORY', 4, 'MALE', TRUE, NULL),
    ('DM 14', 'DORMITORY', 3, 'MALE', TRUE, NULL),
    ('DM 15', 'DORMITORY', 3, 'MALE', TRUE, NULL),
    ('DM 16', 'DORMITORY', 0, 'ANY', FALSE, 'Store Room'),
    ('DM 17', 'DORMITORY', 7, 'ANY', FALSE, 'Staff'),
    ('DM 18', 'DORMITORY', 3, 'ANY', FALSE, 'Cook'),
    ('DM 19', 'DORMITORY', 3, 'ANY', FALSE, 'Driver'),
    ('DM 20', 'DORMITORY', 6, 'ANY', FALSE, 'Double / Housekeeping Staff'),
    ('HALL', 'HALL', 30, 'ANY', TRUE, NULL);

DO $migration$
DECLARE
    desired RECORD;
    room_row public.rooms%ROWTYPE;
    target_category_id INTEGER;
    room_was_created BOOLEAN;
    room_has_live_use BOOLEAN;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.room_rate_cards card
        INNER JOIN public.rooms r ON r.id = card.room_id
        WHERE r.room_number = 'DM 1'
    ) THEN
        RAISE EXCEPTION
            'DM 1 rate configuration is required to provision the new dormitory rooms.';
    END IF;

    FOR desired IN
        SELECT * FROM desired_room_inventory ORDER BY room_number
    LOOP
        SELECT id
        INTO target_category_id
        FROM public.room_categories
        WHERE category_name = desired.category_name;

        IF target_category_id IS NULL THEN
            RAISE EXCEPTION
                'Room category "%" is not configured.',
                desired.category_name;
        END IF;

        SELECT *
        INTO room_row
        FROM public.rooms
        WHERE room_number = desired.room_number
        FOR UPDATE;

        room_was_created := NOT FOUND;

        IF room_was_created THEN
            INSERT INTO public.rooms (
                room_number,
                category_id,
                total_beds,
                room_status,
                is_active,
                is_under_maintenance,
                is_bookable,
                gender_restriction,
                room_note
            )
            VALUES (
                desired.room_number,
                target_category_id,
                desired.total_beds,
                CASE WHEN desired.total_beds = 0 THEN 'STORE' ELSE 'AVAILABLE' END,
                TRUE,
                FALSE,
                desired.is_bookable,
                desired.gender_restriction,
                desired.room_note
            )
            RETURNING * INTO room_row;
        ELSE
            room_has_live_use :=
                EXISTS (
                    SELECT 1
                    FROM public.booking_acceptances ba
                    INNER JOIN public.bookings b ON b.id = ba.booking_id
                    WHERE ba.room_id = room_row.id
                      AND ba.acceptance_status = 'ACCEPTED'
                      AND b.expected_check_out_date >= CURRENT_DATE
                      AND b.booking_status NOT IN ('CANCELLED', 'REJECTED')
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.allotments a
                    WHERE a.room_id = room_row.id
                      AND a.allotment_status = 'ALLOTTED'
                      AND NOT EXISTS (
                          SELECT 1 FROM public.check_outs co
                          WHERE co.allotment_id = a.id
                      )
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.beds bed
                    WHERE bed.room_id = room_row.id
                      AND bed.is_active = TRUE
                      AND UPPER(bed.bed_status) <> 'AVAILABLE'
                )
                OR EXISTS (
                    SELECT 1
                    FROM public.housekeeping_tasks ht
                    WHERE ht.room_id = room_row.id
                      AND UPPER(REPLACE(ht.task_status, ' ', '_')) <> 'CLEARED'
                );

            IF room_has_live_use THEN
                RAISE NOTICE
                    'Deferred room % until bookings and housekeeping are clear.',
                    desired.room_number;
                CONTINUE;
            END IF;

            UPDATE public.rooms
            SET
                category_id = target_category_id,
                total_beds = desired.total_beds,
                room_status = CASE
                    WHEN desired.total_beds = 0 THEN 'STORE'
                    WHEN room_status = 'STORE' THEN 'AVAILABLE'
                    ELSE room_status
                END,
                is_active = TRUE,
                is_bookable = desired.is_bookable,
                gender_restriction = desired.gender_restriction,
                room_note = desired.room_note,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = room_row.id
            RETURNING * INTO room_row;
        END IF;

        UPDATE public.beds
        SET
            is_active = bed_number <= desired.total_beds,
            bed_status = CASE
                WHEN bed_number <= desired.total_beds THEN 'AVAILABLE'
                ELSE bed_status
            END
        WHERE room_id = room_row.id;

        INSERT INTO public.beds (
            room_id,
            bed_number,
            bed_status,
            is_active
        )
        SELECT
            room_row.id,
            bed_number,
            'AVAILABLE',
            TRUE
        FROM generate_series(1, desired.total_beds) AS generated(bed_number)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.beds existing_bed
            WHERE existing_bed.room_id = room_row.id
              AND existing_bed.bed_number = generated.bed_number
        );

        IF desired.category_name = 'DORMITORY' THEN
            INSERT INTO public.room_rate_cards (
                room_id,
                room_capacity,
                bed_capacity,
                esm_room_rate,
                serving_room_rate,
                civilian_room_rate,
                esm_serving_bed_rate,
                civilian_bed_rate,
                updated_by,
                updated_at
            )
            SELECT
                room_row.id,
                template.room_capacity,
                desired.total_beds,
                template.esm_room_rate,
                template.serving_room_rate,
                template.civilian_room_rate,
                template.esm_serving_bed_rate,
                template.civilian_bed_rate,
                template.updated_by,
                CURRENT_TIMESTAMP
            FROM public.room_rate_cards template
            INNER JOIN public.rooms template_room
                ON template_room.id = template.room_id
            WHERE template_room.room_number = 'DM 1'
            ON CONFLICT (room_id) DO UPDATE
            SET bed_capacity = EXCLUDED.bed_capacity,
                updated_at = CURRENT_TIMESTAMP;
        END IF;

        IF NOT desired.is_bookable THEN
            UPDATE public.room_permissions
            SET
                can_book = FALSE,
                can_allot = FALSE,
                can_approve = FALSE,
                emergency_allot = FALSE
            WHERE room_id = room_row.id;
        ELSIF room_was_created THEN
            INSERT INTO public.room_permissions (
                room_id,
                role_name,
                can_book,
                can_allot,
                can_approve,
                emergency_allot
            )
            SELECT
                room_row.id,
                template.role_name,
                template.can_book,
                template.can_allot,
                template.can_approve,
                template.emergency_allot
            FROM public.room_permissions template
            INNER JOIN public.rooms template_room
                ON template_room.id = template.room_id
            WHERE template_room.room_number = 'DM 1'
            ON CONFLICT (room_id, role_name) DO NOTHING;
        END IF;
    END LOOP;

    FOR room_row IN
        SELECT r.*
        FROM public.rooms r
        INNER JOIN public.room_categories rc ON rc.id = r.category_id
        WHERE r.is_active = TRUE
          AND rc.category_name IN ('AC', 'VIP', 'NON_AC', 'DORMITORY', 'HALL')
          AND NOT EXISTS (
              SELECT 1
              FROM desired_room_inventory target_inventory
              WHERE target_inventory.room_number = r.room_number
          )
        FOR UPDATE OF r
    LOOP
        room_has_live_use :=
            EXISTS (
                SELECT 1
                FROM public.booking_acceptances ba
                INNER JOIN public.bookings b ON b.id = ba.booking_id
                WHERE ba.room_id = room_row.id
                  AND ba.acceptance_status = 'ACCEPTED'
                  AND b.expected_check_out_date >= CURRENT_DATE
                  AND b.booking_status NOT IN ('CANCELLED', 'REJECTED')
            )
            OR EXISTS (
                SELECT 1
                FROM public.allotments a
                WHERE a.room_id = room_row.id
                  AND a.allotment_status = 'ALLOTTED'
                  AND NOT EXISTS (
                      SELECT 1 FROM public.check_outs co
                      WHERE co.allotment_id = a.id
                  )
            )
            OR EXISTS (
                SELECT 1
                FROM public.beds bed
                WHERE bed.room_id = room_row.id
                  AND bed.is_active = TRUE
                  AND UPPER(bed.bed_status) <> 'AVAILABLE'
            )
            OR EXISTS (
                SELECT 1
                FROM public.housekeeping_tasks ht
                WHERE ht.room_id = room_row.id
                  AND UPPER(REPLACE(ht.task_status, ' ', '_')) <> 'CLEARED'
            );

        IF room_has_live_use THEN
            RAISE NOTICE
                'Deferred removal of room % until bookings and housekeeping are clear.',
                room_row.room_number;
            CONTINUE;
        END IF;

        UPDATE public.rooms
        SET
            is_active = FALSE,
            is_bookable = FALSE,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = room_row.id;

        UPDATE public.room_permissions
        SET can_book = FALSE,
            can_allot = FALSE,
            can_approve = FALSE,
            emergency_allot = FALSE
        WHERE room_id = room_row.id;

        UPDATE public.beds
        SET is_active = FALSE
        WHERE room_id = room_row.id
          AND is_active = TRUE;
    END LOOP;
END;
$migration$;

COMMIT;
