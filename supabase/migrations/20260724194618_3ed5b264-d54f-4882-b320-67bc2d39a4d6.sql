
-- Cambridge levels enum
DO $$ BEGIN
  CREATE TYPE public.cambridge_level AS ENUM ('igcse','o_level','as_level','a_level','checkpoint','primary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cambridge_session AS ENUM ('feb_march','may_june','oct_nov');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cambridge registrations
CREATE TABLE IF NOT EXISTS public.cambridge_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  centre_number TEXT,
  candidate_number TEXT,
  level public.cambridge_level NOT NULL,
  session public.cambridge_session NOT NULL,
  session_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cambridge_registrations TO authenticated;
GRANT ALL ON public.cambridge_registrations TO service_role;
ALTER TABLE public.cambridge_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cam_reg campus access" ON public.cambridge_registrations
  FOR ALL USING (get_user_tenant(auth.uid()) = tenant_id AND (has_campus_access(auth.uid(), campus_id) OR is_student_owner(auth.uid(), student_id)))
  WITH CHECK (get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));
CREATE TRIGGER cambridge_reg_upd BEFORE UPDATE ON public.cambridge_registrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cambridge subject entries
CREATE TABLE IF NOT EXISTS public.cambridge_subject_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  registration_id UUID NOT NULL REFERENCES public.cambridge_registrations(id) ON DELETE CASCADE,
  syllabus_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  components TEXT,
  tier TEXT,
  is_carry_forward BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cambridge_subject_entries TO authenticated;
GRANT ALL ON public.cambridge_subject_entries TO service_role;
ALTER TABLE public.cambridge_subject_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cam_entry campus access" ON public.cambridge_subject_entries
  FOR ALL USING (get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
    SELECT 1 FROM public.cambridge_registrations r WHERE r.id = registration_id AND has_campus_access(auth.uid(), r.campus_id)
  ))
  WITH CHECK (get_user_tenant(auth.uid()) = tenant_id);
CREATE TRIGGER cambridge_entry_upd BEFORE UPDATE ON public.cambridge_subject_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cambridge results
CREATE TABLE IF NOT EXISTS public.cambridge_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entry_id UUID NOT NULL REFERENCES public.cambridge_subject_entries(id) ON DELETE CASCADE,
  ums INTEGER,
  percentage NUMERIC(5,2),
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  remarks TEXT,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cambridge_results TO authenticated;
GRANT ALL ON public.cambridge_results TO service_role;
ALTER TABLE public.cambridge_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cam_res campus access" ON public.cambridge_results
  FOR ALL USING (get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
    SELECT 1 FROM public.cambridge_subject_entries e
    JOIN public.cambridge_registrations r ON r.id = e.registration_id
    WHERE e.id = entry_id AND (has_campus_access(auth.uid(), r.campus_id) OR is_student_owner(auth.uid(), r.student_id))
  ))
  WITH CHECK (get_user_tenant(auth.uid()) = tenant_id);
CREATE TRIGGER cambridge_res_upd BEFORE UPDATE ON public.cambridge_results FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track switch log (Board <-> Cambridge switch history per student)
CREATE TABLE IF NOT EXISTS public.track_switches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_system TEXT NOT NULL,
  to_system TEXT NOT NULL,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  approved_by UUID,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.track_switches TO authenticated;
GRANT ALL ON public.track_switches TO service_role;
ALTER TABLE public.track_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "track_switch campus access" ON public.track_switches
  FOR ALL USING (get_user_tenant(auth.uid()) = tenant_id AND (has_campus_access(auth.uid(), campus_id) OR is_student_owner(auth.uid(), student_id)))
  WITH CHECK (get_user_tenant(auth.uid()) = tenant_id AND has_campus_access(auth.uid(), campus_id));
CREATE TRIGGER track_switch_upd BEFORE UPDATE ON public.track_switches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
