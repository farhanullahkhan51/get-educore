
CREATE TYPE public.attendance_status AS ENUM ('present','absent','late','leave');
CREATE TYPE public.assessment_type   AS ENUM ('quiz','assignment','midterm','final','project','other');
CREATE TYPE public.report_card_status AS ENUM ('draft','published','locked');

-- courses
CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  class_id  uuid REFERENCES public.classes(id)  ON DELETE SET NULL,
  code text NOT NULL,
  title text NOT NULL,
  credit_hours numeric(4,2) DEFAULT 1,
  academic_system text CHECK (academic_system IN ('board','cambridge','both')) DEFAULT 'both',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campus_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT ALL ON public.courses TO service_role;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "courses read same campus" ON public.courses FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "courses admin write" ON public.courses FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')));
CREATE TRIGGER trg_courses_updated BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- course_assignments
CREATE TABLE public.course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  academic_year text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, section_id, teacher_id, academic_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_assignments TO authenticated;
GRANT ALL ON public.course_assignments TO service_role;
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments read same campus" ON public.course_assignments FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "assignments admin write" ON public.course_assignments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')));
CREATE TRIGGER trg_course_assignments_updated BEFORE UPDATE ON public.course_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: teacher of section (profile_id = auth.uid())
CREATE OR REPLACE FUNCTION public.teacher_of_section(_user_id uuid, _section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_assignments ca
    JOIN public.staff s ON s.id = ca.teacher_id
    WHERE s.profile_id = _user_id AND ca.section_id = _section_id
  );
$$;

CREATE OR REPLACE FUNCTION public.teacher_of_course_section(_user_id uuid, _course_id uuid, _section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.course_assignments ca
    JOIN public.staff s ON s.id = ca.teacher_id
    WHERE s.profile_id = _user_id AND ca.section_id = _section_id AND ca.course_id = _course_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_student_owner(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students st WHERE st.id = _student_id AND st.profile_id = _user_id
  );
$$;

-- attendance_records
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id  uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  date date NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  remarks text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date, course_id)
);
CREATE INDEX idx_attendance_section_date ON public.attendance_records(section_id, date);
CREATE INDEX idx_attendance_student ON public.attendance_records(student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance read" ON public.attendance_records FOR SELECT TO authenticated
  USING (
    public.has_campus_access(auth.uid(), campus_id)
    OR public.teacher_of_section(auth.uid(), section_id)
    OR public.is_student_owner(auth.uid(), student_id)
  );
CREATE POLICY "attendance write teacher/admin" ON public.attendance_records FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR public.teacher_of_section(auth.uid(), section_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR public.teacher_of_section(auth.uid(), section_id)
  );
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- assessments
CREATE TABLE public.assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  type public.assessment_type NOT NULL DEFAULT 'quiz',
  max_marks numeric(6,2) NOT NULL DEFAULT 100,
  weight_percent numeric(5,2) NOT NULL DEFAULT 10,
  due_date date,
  term text,
  academic_year text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments read" ON public.assessments FOR SELECT TO authenticated
  USING (
    public.has_campus_access(auth.uid(), campus_id)
    OR public.teacher_of_course_section(auth.uid(), course_id, section_id)
    OR EXISTS (SELECT 1 FROM public.students st WHERE st.section_id = assessments.section_id AND st.profile_id = auth.uid())
  );
CREATE POLICY "assessments write teacher/admin" ON public.assessments FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR public.teacher_of_course_section(auth.uid(), course_id, section_id)
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR public.teacher_of_course_section(auth.uid(), course_id, section_id)
  );
CREATE TRIGGER trg_assessments_updated BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- assessment_scores
CREATE TABLE public.assessment_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  marks numeric(6,2),
  remarks text,
  is_absent boolean NOT NULL DEFAULT false,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_scores TO authenticated;
GRANT ALL ON public.assessment_scores TO service_role;
ALTER TABLE public.assessment_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scores read" ON public.assessment_scores FOR SELECT TO authenticated
  USING (
    public.has_campus_access(auth.uid(), campus_id)
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND public.teacher_of_course_section(auth.uid(), a.course_id, a.section_id)
    )
    OR public.is_student_owner(auth.uid(), student_id)
  );
CREATE POLICY "scores write teacher/admin" ON public.assessment_scores FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND public.teacher_of_course_section(auth.uid(), a.course_id, a.section_id)
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin'))
    OR EXISTS (
      SELECT 1 FROM public.assessments a
      WHERE a.id = assessment_id
        AND public.teacher_of_course_section(auth.uid(), a.course_id, a.section_id)
    )
  );
CREATE TRIGGER trg_scores_updated BEFORE UPDATE ON public.assessment_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- grading_scales
CREATE TABLE public.grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid REFERENCES public.campuses(id) ON DELETE CASCADE,
  name text NOT NULL,
  bands jsonb NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grading_scales TO authenticated;
GRANT ALL ON public.grading_scales TO service_role;
ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grading read" ON public.grading_scales FOR SELECT TO authenticated
  USING (campus_id IS NULL OR public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "grading admin write" ON public.grading_scales FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (campus_id IS NOT NULL AND public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (campus_id IS NOT NULL AND public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')));
CREATE TRIGGER trg_grading_updated BEFORE UPDATE ON public.grading_scales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.grading_scales (campus_id, name, bands, is_default) VALUES
  (NULL, 'EduCore Default 4.0', '[
    {"grade":"A+","min":90,"gpa":4.0},
    {"grade":"A","min":85,"gpa":4.0},
    {"grade":"A-","min":80,"gpa":3.7},
    {"grade":"B+","min":75,"gpa":3.3},
    {"grade":"B","min":70,"gpa":3.0},
    {"grade":"C","min":60,"gpa":2.0},
    {"grade":"D","min":50,"gpa":1.0},
    {"grade":"F","min":0,"gpa":0.0}
  ]'::jsonb, true);

-- report_cards
CREATE TABLE public.report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  term text NOT NULL,
  academic_year text NOT NULL,
  status public.report_card_status NOT NULL DEFAULT 'draft',
  subjects jsonb NOT NULL DEFAULT '[]'::jsonb,
  gpa numeric(4,2),
  overall_percent numeric(5,2),
  attendance_percent numeric(5,2),
  remarks text,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, term, academic_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_cards TO authenticated;
GRANT ALL ON public.report_cards TO service_role;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_cards read" ON public.report_cards FOR SELECT TO authenticated
  USING (
    public.has_campus_access(auth.uid(), campus_id)
    OR (status = 'published' AND public.is_student_owner(auth.uid(), student_id))
  );
CREATE POLICY "report_cards admin write" ON public.report_cards FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')))
  WITH CHECK (public.is_super_admin(auth.uid())
      OR (public.get_user_campus(auth.uid()) = campus_id AND public.has_role(auth.uid(),'campus_admin')));
CREATE TRIGGER trg_report_cards_updated BEFORE UPDATE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
