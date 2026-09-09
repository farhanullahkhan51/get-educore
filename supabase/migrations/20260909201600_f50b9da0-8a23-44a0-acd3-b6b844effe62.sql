CREATE OR REPLACE FUNCTION public.set_section_seat(_section_id uuid, _seat_index integer, _student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sec public.sections%ROWTYPE;
  student_row public.students%ROWTYPE;
  occupant public.section_seats%ROWTYPE;
  current_seat public.section_seats%ROWTYPE;
  previous_index integer;
BEGIN
  SELECT * INTO sec
  FROM public.sections
  WHERE id = _section_id
  FOR UPDATE;

  IF sec.id IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public.has_campus_access(auth.uid(), sec.campus_id) THEN
    RAISE EXCEPTION 'Not authorized for this campus';
  END IF;
  IF _seat_index < 0 OR _seat_index >= COALESCE(sec.capacity, 40) THEN
    RAISE EXCEPTION 'Seat out of range';
  END IF;

  SELECT * INTO student_row
  FROM public.students
  WHERE id = _student_id
  FOR UPDATE;

  IF student_row.id IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  IF student_row.tenant_id <> sec.tenant_id OR student_row.campus_id <> sec.campus_id THEN
    RAISE EXCEPTION 'Student belongs to a different institution or campus';
  END IF;
  IF student_row.status <> 'active' THEN
    RAISE EXCEPTION 'Only active students can be seated';
  END IF;
  IF sec.academic_system <> 'both'
     AND student_row.academic_system <> 'both'
     AND sec.academic_system <> student_row.academic_system THEN
    RAISE EXCEPTION 'Student and section academic systems do not match';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_section_id::text, 0));

  SELECT * INTO current_seat
  FROM public.section_seats
  WHERE student_id = _student_id
  FOR UPDATE;

  SELECT * INTO occupant
  FROM public.section_seats
  WHERE section_id = _section_id AND seat_index = _seat_index
  FOR UPDATE;

  IF occupant.id IS NOT NULL AND occupant.student_id = _student_id THEN
    UPDATE public.students
    SET section_id = _section_id, class_id = sec.class_id
    WHERE id = _student_id;
    RETURN;
  END IF;

  previous_index := current_seat.seat_index;

  IF current_seat.id IS NOT NULL AND current_seat.section_id <> _section_id THEN
    DELETE FROM public.section_seats WHERE id = current_seat.id;
    current_seat := NULL;
    previous_index := NULL;
  END IF;

  IF occupant.id IS NOT NULL AND current_seat.id IS NOT NULL THEN
    UPDATE public.section_seats SET seat_index = -1 WHERE id = occupant.id;
    UPDATE public.section_seats SET seat_index = _seat_index WHERE id = current_seat.id;
    UPDATE public.section_seats SET seat_index = previous_index WHERE id = occupant.id;
  ELSIF occupant.id IS NOT NULL THEN
    DELETE FROM public.section_seats WHERE id = occupant.id;
    INSERT INTO public.section_seats (tenant_id, campus_id, section_id, seat_index, student_id)
    VALUES (sec.tenant_id, sec.campus_id, _section_id, _seat_index, _student_id);
  ELSIF current_seat.id IS NOT NULL THEN
    UPDATE public.section_seats SET seat_index = _seat_index WHERE id = current_seat.id;
  ELSE
    INSERT INTO public.section_seats (tenant_id, campus_id, section_id, seat_index, student_id)
    VALUES (sec.tenant_id, sec.campus_id, _section_id, _seat_index, _student_id);
  END IF;

  UPDATE public.students
  SET section_id = _section_id, class_id = sec.class_id
  WHERE id = _student_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) TO authenticated, service_role;