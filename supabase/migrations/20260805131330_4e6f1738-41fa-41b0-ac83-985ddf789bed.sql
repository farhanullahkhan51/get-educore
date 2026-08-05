ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS class_teacher_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

CREATE TABLE public.section_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, seat_index),
  UNIQUE (section_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.section_seats TO authenticated;
GRANT ALL ON public.section_seats TO service_role;

ALTER TABLE public.section_seats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View seating for accessible campuses"
ON public.section_seats FOR SELECT TO authenticated
USING (public.has_campus_access(auth.uid(), campus_id));

CREATE POLICY "Manage seating"
ON public.section_seats FOR ALL TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (public.has_campus_access(auth.uid(), campus_id)
      AND (public.has_role(auth.uid(), 'campus_admin')
        OR public.teacher_of_section(auth.uid(), section_id)))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (public.has_campus_access(auth.uid(), campus_id)
      AND (public.has_role(auth.uid(), 'campus_admin')
        OR public.teacher_of_section(auth.uid(), section_id)))
);

CREATE TRIGGER trg_section_seats_updated
BEFORE UPDATE ON public.section_seats
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();