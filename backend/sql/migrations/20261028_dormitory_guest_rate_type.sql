BEGIN;

ALTER TABLE booking_acceptances
    ADD COLUMN IF NOT EXISTS guest_type TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'booking_acceptances_guest_type_check'
          AND conrelid = 'booking_acceptances'::regclass
    ) THEN
        ALTER TABLE booking_acceptances
            ADD CONSTRAINT booking_acceptances_guest_type_check
                CHECK (
                    guest_type IS NULL OR
                    guest_type IN ('ESM', 'SERVING', 'CIVILIAN')
                );
    END IF;
END
$$;

COMMIT;
