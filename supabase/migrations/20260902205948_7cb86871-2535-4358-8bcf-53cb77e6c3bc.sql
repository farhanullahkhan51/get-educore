CREATE TABLE public.timetable_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  period_number INTEGER NOT NULL CHECK (period_number > 0),
  label TEXT,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_break BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (campus_id, day_of_week, period_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_periods TO authenticated;
GRANT ALL ON public.timetable_periods TO service_role;

ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view periods" ON public.timetable_periods
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Campus admins can manage periods" ON public.timetable_periods
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
  );

CREATE TABLE public.timetable_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  period_id UUID NOT NULL REFERENCES public.timetable_periods(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  teacher_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  room TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (section_id, period_id)
);

-- Clash protection: a teacher cannot be in two sections in the same period,
-- and a room cannot host two sections in the same period on a campus.
CREATE UNIQUE INDEX timetable_entries_teacher_slot
  ON public.timetable_entries (period_id, teacher_id)
  WHERE teacher_id IS NOT NULL;

CREATE UNIQUE INDEX timetable_entries_room_slot
  ON public.timetable_entries (period_id, room)
  WHERE room IS NOT NULL AND room <> '';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_entries TO authenticated;
GRANT ALL ON public.timetable_entries TO service_role;

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view timetable entries" ON public.timetable_entries
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Campus admins can manage timetable entries" ON public.timetable_entries
  FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
  );

CREATE TRIGGER update_timetable_periods_updated_at BEFORE UPDATE ON public.timetable_periods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_timetable_entries_updated_at BEFORE UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read-only enforcement for expired trials / suspended tenants
CREATE TRIGGER enforce_timetable_periods_writable BEFORE INSERT OR UPDATE ON public.timetable_periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER enforce_timetable_entries_writable BEFORE INSERT OR UPDATE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

-- Plan gating: timetable on for Pro and Enterprise
UPDATE public.plan_tiers
SET feature_flags = feature_flags || '{"timetable": true}'::jsonb
WHERE name IN ('Pro', 'Enterprise');

UPDATE public.plan_tiers
SET feature_flags = feature_flags || '{"timetable": false}'::jsonb
WHERE name = 'Starter';