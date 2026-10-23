BEGIN;

ALTER TABLE public.rooms
    ADD COLUMN IF NOT EXISTS delayed_checkout_hourly_rate NUMERIC(12, 2)
        NOT NULL DEFAULT 0
        CHECK (delayed_checkout_hourly_rate >= 0);

ALTER TABLE public.beds
    ADD COLUMN IF NOT EXISTS delayed_checkout_hourly_rate NUMERIC(12, 2)
        NOT NULL DEFAULT 0
        CHECK (delayed_checkout_hourly_rate >= 0);

ALTER TABLE public.check_outs
    ADD COLUMN IF NOT EXISTS checkout_type TEXT NOT NULL DEFAULT 'SCHEDULED';

ALTER TABLE public.check_outs
    ADD COLUMN IF NOT EXISTS delayed_checkout_hourly_rate NUMERIC(12, 2);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_outs_checkout_type_check'
          AND conrelid = 'public.check_outs'::regclass
    ) THEN
        ALTER TABLE public.check_outs
            ADD CONSTRAINT check_outs_checkout_type_check
            CHECK (checkout_type IN (
                'SCHEDULED',
                'PRE_CHECKOUT',
                'DELAYED_CHECKOUT'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_outs_delayed_checkout_rate_check'
          AND conrelid = 'public.check_outs'::regclass
    ) THEN
        ALTER TABLE public.check_outs
            ADD CONSTRAINT check_outs_delayed_checkout_rate_check
            CHECK (
                delayed_checkout_hourly_rate IS NULL
                OR delayed_checkout_hourly_rate >= 0
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'check_outs_delayed_checkout_rate_required_check'
          AND conrelid = 'public.check_outs'::regclass
    ) THEN
        ALTER TABLE public.check_outs
            ADD CONSTRAINT check_outs_delayed_checkout_rate_required_check
            CHECK (
                checkout_type <> 'DELAYED_CHECKOUT'
                OR (
                    delayed_checkout_hourly_rate IS NOT NULL
                    AND delayed_checkout_hourly_rate > 0
                )
            );
    END IF;
END;
$migration$;

COMMIT;
