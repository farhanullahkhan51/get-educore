-- One chair per student, system-wide
CREATE UNIQUE INDEX IF NOT EXISTS section_seats_one_per_student
  ON public.section_seats (student_id);

-- Seating a student frees any chair they hold elsewhere
CREATE OR REPLACE FUNCTION public.set_section_seat(_section_id uuid, _seat_index integer, _student_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- release any chair this student holds in a different classroom
  DELETE FROM public.section_seats
   WHERE student_id = _student_id AND section_id <> _section_id;

  SELECT * INTO occupant FROM public.section_seats WHERE section_id = _section_id AND seat_index = _seat_index;
  SELECT * INTO current_seat FROM public.section_seats WHERE section_id = _section_id AND student_id = _student_id;

  IF occupant.id IS NOT NULL AND occupant.student_id = _student_id THEN
    RETURN;
  END IF;

  IF occupant.id IS NOT NULL AND current_seat.id IS NOT NULL THEN
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
$function$;

-- Moving a student to another section releases the chair they left behind
CREATE OR REPLACE FUNCTION public.release_seat_on_section_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.section_id IS DISTINCT FROM OLD.section_id THEN
    DELETE FROM public.section_seats
     WHERE student_id = NEW.id
       AND (NEW.section_id IS NULL OR section_id <> NEW.section_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS students_release_seat_on_section_change ON public.students;
CREATE TRIGGER students_release_seat_on_section_change
AFTER UPDATE OF section_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.release_seat_on_section_change();