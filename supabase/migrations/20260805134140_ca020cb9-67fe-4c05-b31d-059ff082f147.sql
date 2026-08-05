CREATE OR REPLACE FUNCTION public.set_section_seat(_section_id uuid, _seat_index integer, _student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sec public.sections%ROWTYPE;
  occupant public.section_seats%ROWTYPE;
  current_seat public.section_seats%ROWTYPE;
BEGIN
  SELECT * INTO sec FROM public.sections WHERE id = _section_id;
  IF sec.id IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public.has_campus_access(auth.uid(), sec.campus_id) THEN
    RAISE EXCEPTION 'Not authorized for this campus';
  END IF;
  IF _seat_index < 0 OR _seat_index >= COALESCE(sec.capacity, 40) THEN
    RAISE EXCEPTION 'Seat out of range';
  END IF;

  SELECT * INTO occupant FROM public.section_seats WHERE section_id = _section_id AND seat_index = _seat_index;
  SELECT * INTO current_seat FROM public.section_seats WHERE section_id = _section_id AND student_id = _student_id;

  IF occupant.id IS NOT NULL AND occupant.student_id = _student_id THEN
    RETURN;
  END IF;

  IF occupant.id IS NOT NULL AND current_seat.id IS NOT NULL THEN
    -- swap: park occupant on a temporary negative index, then settle
    UPDATE public.section_seats SET seat_index = -1 WHERE id = occupant.id;
    UPDATE public.section_seats SET seat_index = _seat_index WHERE id = current_seat.id;
    UPDATE public.section_seats SET seat_index = current_seat.seat_index WHERE id = occupant.id;
  ELSIF occupant.id IS NOT NULL THEN
    UPDATE public.section_seats SET student_id = _student_id WHERE id = occupant.id;
  ELSIF current_seat.id IS NOT NULL THEN
    UPDATE public.section_seats SET seat_index = _seat_index WHERE id = current_seat.id;
  ELSE
    INSERT INTO public.section_seats (tenant_id, campus_id, section_id, seat_index, student_id)
    VALUES (sec.tenant_id, sec.campus_id, _section_id, _seat_index, _student_id);
  END IF;

  UPDATE public.students SET section_id = _section_id, class_id = sec.class_id WHERE id = _student_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) TO authenticated;