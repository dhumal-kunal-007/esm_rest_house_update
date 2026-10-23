BEGIN;

CREATE TABLE IF NOT EXISTS public.delayed_checkout_rate_cards (
    rate_category TEXT PRIMARY KEY
        CHECK (rate_category IN ('AC', 'NAC', 'DM_BED', 'VIP')),
    hourly_rate NUMERIC(12, 2) NOT NULL DEFAULT 0
        CHECK (hourly_rate >= 0),
    updated_by UUID REFERENCES public.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.delayed_checkout_rate_cards (rate_category)
VALUES ('AC'), ('NAC'), ('DM_BED'), ('VIP')
ON CONFLICT (rate_category) DO NOTHING;

COMMIT;
