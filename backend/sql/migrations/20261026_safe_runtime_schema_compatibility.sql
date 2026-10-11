BEGIN;

ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS allowed_gender VARCHAR(10),
    ADD COLUMN IF NOT EXISTS room_usage VARCHAR(40) NOT NULL DEFAULT 'GUEST';

ALTER TABLE public.guests
    ADD COLUMN IF NOT EXISTS guest_category VARCHAR(10);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.rooms'::regclass
          AND conname = 'rooms_allowed_gender_check'
    ) THEN
        ALTER TABLE public.rooms
            ADD CONSTRAINT rooms_allowed_gender_check
            CHECK (allowed_gender IS NULL OR allowed_gender IN ('MALE', 'FEMALE'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.guests'::regclass
          AND conname = 'guests_guest_category_check'
    ) THEN
        ALTER TABLE public.guests
            ADD CONSTRAINT guests_guest_category_check
            CHECK (
                guest_category IS NULL
                OR guest_category IN ('MALE', 'FEMALE', 'CHILD', 'GUEST')
            );
    END IF;
END;
$migration$;

UPDATE public.rooms
SET allowed_gender = NULLIF(UPPER(gender_restriction), 'ANY')
WHERE allowed_gender IS NULL
  AND UPPER(COALESCE(gender_restriction, 'ANY')) IN ('MALE', 'FEMALE');

UPDATE public.rooms
SET room_usage = CASE
    WHEN UPPER(COALESCE(room_status, '')) = 'STORE'
      OR UPPER(COALESCE(room_note, '')) LIKE '%STORE%'
        THEN 'STORE'
    WHEN UPPER(COALESCE(room_note, '')) LIKE '%HOUSEKEEPING%'
      OR UPPER(COALESCE(room_note, '')) LIKE '%DOUBLE%'
        THEN 'HOUSEKEEPING_STAFF'
    WHEN UPPER(COALESCE(room_note, '')) LIKE '%COOK%'
        THEN 'COOK_STAFF'
    WHEN UPPER(COALESCE(room_note, '')) LIKE '%DRIVER%'
        THEN 'DRIVER_STAFF'
    WHEN UPPER(COALESCE(room_note, '')) LIKE '%STAFF%'
        THEN 'WORK_STAFF'
    ELSE 'OUT_OF_SCOPE'
END
WHERE is_bookable = FALSE
  AND room_usage = 'GUEST';

UPDATE public.guests
SET guest_category = UPPER(gender)
WHERE guest_category IS NULL
  AND UPPER(COALESCE(gender, '')) IN ('MALE', 'FEMALE');

COMMIT;
