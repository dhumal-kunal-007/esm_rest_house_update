BEGIN;

DO $migration$
DECLARE
    target_room_count INTEGER;
    rooms_in_use TEXT;
BEGIN
    SELECT COUNT(*)::INTEGER
    INTO target_room_count
    FROM public.rooms
    WHERE UPPER(TRIM(room_number)) IN ('NAC 10', 'NAC 11', 'NAC 12');

    IF target_room_count <> 3 THEN
        RAISE EXCEPTION
            'Expected NAC 10, NAC 11, and NAC 12; found % matching rooms.',
            target_room_count;
    END IF;

    PERFORM 1
    FROM public.rooms
    WHERE UPPER(TRIM(room_number)) IN ('NAC 10', 'NAC 11', 'NAC 12')
    FOR UPDATE;

    SELECT STRING_AGG(DISTINCT r.room_number, ', ' ORDER BY r.room_number)
    INTO rooms_in_use
    FROM public.rooms r
    WHERE UPPER(TRIM(r.room_number)) IN ('NAC 10', 'NAC 11', 'NAC 12')
      AND (
          EXISTS (
              SELECT 1
              FROM public.booking_acceptances ba
              INNER JOIN public.bookings b ON b.id = ba.booking_id
              WHERE ba.room_id = r.id
                AND ba.acceptance_status = 'ACCEPTED'
                AND b.expected_check_out_date >= CURRENT_DATE
                AND b.booking_status NOT IN ('CANCELLED', 'REJECTED')
          )
          OR EXISTS (
              SELECT 1
              FROM public.allotments a
              WHERE a.room_id = r.id
                AND a.allotment_status = 'ALLOTTED'
                AND NOT EXISTS (
                    SELECT 1
                    FROM public.check_outs co
                    WHERE co.allotment_id = a.id
                )
          )
      );

    IF rooms_in_use IS NOT NULL THEN
        RAISE EXCEPTION
            'Cannot retire rooms with active bookings or allotments: %.',
            rooms_in_use;
    END IF;
END;
$migration$;

UPDATE public.rooms
SET
    is_active = FALSE,
    is_bookable = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE UPPER(TRIM(room_number)) IN ('NAC 10', 'NAC 11', 'NAC 12');

COMMIT;
