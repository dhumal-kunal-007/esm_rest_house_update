BEGIN;

ALTER TABLE public.booking_acceptances
    ADD COLUMN IF NOT EXISTS approval_authority_role TEXT;

UPDATE public.booking_acceptances ba
SET approval_authority_role = (
    SELECT rp.role_name
    FROM public.room_permissions rp
    WHERE rp.room_id = ba.room_id
      AND rp.can_approve = TRUE
    ORDER BY
        CASE WHEN rp.role_name = 'RECEPTIONIST' THEN 1 ELSE 0 END,
        rp.role_name
    LIMIT 1
)
WHERE ba.approval_authority_role IS NULL
  AND ba.acceptance_status = 'ACCEPTED';

COMMIT;
