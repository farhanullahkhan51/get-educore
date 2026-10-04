CREATE TABLE public.timetable_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT get_user_tenant(auth.uid()),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  date date NOT NULL,
  period_id uuid NOT NULL REFERENCES public.timetable_periods(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  absent_teacher_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  proxy_teacher_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed','cancelled')),
  remarks text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (absent_teacher_id <> proxy_teacher_id)
);
CREATE UNIQUE INDEX timetable_subs_section_slot ON public.timetable_substitutions (section_id, date, period_id) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX timetable_subs_proxy_slot ON public.timetable_substitutions (proxy_teacher_id, date, period_id) WHERE status <> 'cancelled';
CREATE INDEX timetable_subs_tenant_date ON public.timetable_substitutions (tenant_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_substitutions TO authenticated;
GRANT ALL ON public.timetable_substitutions TO service_role;
ALTER TABLE public.timetable_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view substitutions" ON public.timetable_substitutions
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins manage substitutions" ON public.timetable_substitutions
  FOR ALL TO authenticated
  USING (tenant_id = get_user_tenant(auth.uid()) AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'campus_admin'::app_role)))
  WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'campus_admin'::app_role)));

CREATE TRIGGER timetable_subs_updated_at BEFORE UPDATE ON public.timetable_substitutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();