
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM (
  'super_admin', 'campus_admin', 'admissions_officer',
  'finance_officer', 'teacher', 'student'
);

CREATE TYPE public.academic_system AS ENUM ('board', 'cambridge', 'both');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ CAMPUSES ============
CREATE TABLE public.campuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  email TEXT,
  academic_system public.academic_system NOT NULL DEFAULT 'board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campuses TO authenticated;
GRANT ALL ON public.campuses TO service_role;
ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_campuses_updated BEFORE UPDATE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, campus_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_campus(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT campus_id FROM public.profiles WHERE id = _user_id;
$$;

-- has_campus_access: super_admin OR user's campus matches
CREATE OR REPLACE FUNCTION public.has_campus_access(_user_id UUID, _campus_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id)
      OR public.get_user_campus(_user_id) = _campus_id;
$$;

-- ============ Auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  -- If this is the very first user, make them super_admin
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS: CAMPUSES ============
CREATE POLICY "campuses_select_all_authenticated" ON public.campuses
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "campuses_super_admin_all" ON public.campuses
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ RLS: PROFILES ============
CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid()
      OR public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
      OR (public.has_role(auth.uid(), 'teacher') AND campus_id = public.get_user_campus(auth.uid()))
      OR (public.has_role(auth.uid(), 'admissions_officer') AND campus_id = public.get_user_campus(auth.uid()))
      OR (public.has_role(auth.uid(), 'finance_officer') AND campus_id = public.get_user_campus(auth.uid()))
  );
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid())))
  WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid())));
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR public.is_super_admin(auth.uid()));

-- ============ RLS: USER_ROLES ============
CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())));
CREATE POLICY "user_roles_super_admin_manage" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- ============ PROGRAMS ============
CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  duration_years INT DEFAULT 2,
  academic_system public.academic_system NOT NULL DEFAULT 'board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_programs_updated BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "programs_select_campus" ON public.programs
  FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "programs_manage_admin" ON public.programs
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())));

-- ============ CLASSES ============
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  grade_level TEXT,
  academic_system public.academic_system NOT NULL DEFAULT 'board',
  academic_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_classes_updated BEFORE UPDATE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "classes_select_campus" ON public.classes
  FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "classes_manage_admin" ON public.classes
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())));

-- ============ SECTIONS ============
CREATE TABLE public.sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT DEFAULT 40,
  room TEXT,
  academic_system public.academic_system NOT NULL DEFAULT 'board',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sections_updated BEFORE UPDATE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "sections_select_campus" ON public.sections
  FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "sections_manage_admin" ON public.sections
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())));

-- ============ STUDENTS ============
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  address TEXT,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
  academic_system public.academic_system NOT NULL DEFAULT 'board',
  admission_date DATE DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'active',
  documents JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "students_select_scoped" ON public.students
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'admissions_officer') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'finance_officer') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'teacher') AND campus_id = public.get_user_campus(auth.uid()))
  );
CREATE POLICY "students_manage_admin" ON public.students
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'admissions_officer') AND campus_id = public.get_user_campus(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'admissions_officer') AND campus_id = public.get_user_campus(auth.uid()))
  );

-- ============ STAFF ============
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  staff_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  designation TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  date_of_joining DATE DEFAULT CURRENT_DATE,
  qualification TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  documents JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_staff_updated BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "staff_select_scoped" ON public.staff
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'admissions_officer') AND campus_id = public.get_user_campus(auth.uid()))
    OR (public.has_role(auth.uid(), 'finance_officer') AND campus_id = public.get_user_campus(auth.uid()))
  );
CREATE POLICY "staff_manage_admin" ON public.staff
  FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'campus_admin') AND campus_id = public.get_user_campus(auth.uid()))
  );

-- ============ AUDIT LOGS (seed for later phases) ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.has_role(auth.uid(), 'campus_admin')
          AND campus_id = public.get_user_campus(auth.uid())));
CREATE POLICY "audit_logs_insert_authenticated" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());
