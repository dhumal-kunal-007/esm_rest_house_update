BEGIN;

ALTER TABLE public.guests
    ADD COLUMN IF NOT EXISTS guest_category VARCHAR(10);

UPDATE public.guests
SET guest_category = UPPER(gender)
WHERE guest_category IS NULL
  AND UPPER(COALESCE(gender, '')) IN ('MALE', 'FEMALE');

DO $migration$
BEGIN
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

COMMIT;
