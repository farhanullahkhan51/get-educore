
-- Phase 4B: BISE Board module

CREATE TYPE public.board_level AS ENUM ('matric', 'inter');
CREATE TYPE public.board_group AS ENUM ('science','arts','commerce','pre_medical','pre_engineering','computer_science','general');
CREATE TYPE public.board_registration_status AS ENUM ('draft','submitted','approved','rejected','cancelled');
CREATE TYPE public.board_result_status AS ENUM ('pass','fail','absent','withheld','pending');

-- Registrations
CREATE TABLE public.board_registrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campus_id UUID NOT NULL REFERENCES public.campuses(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  board_name TEXT NOT NULL,
  level public.board_level NOT NULL,
  group_name public.board_group NOT NULL,
  session_year TEXT NOT NULL,
  part TEXT,
  roll_no TEXT,
  registration_no TEXT,
  exam_center TEXT,
  status public.board_registration_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campus_id, student_id, level, session_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_registrations TO authenticated;
GRANT ALL ON public.board_registrations TO service_role;
ALTER TABLE public.board_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_reg campus access"
  ON public.board_registrations FOR ALL TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id) OR public.is_student_owner(auth.uid(), student_id))
  WITH CHECK (public.has_campus_access(auth.uid(), campus_id));
CREATE TRIGGER board_reg_upd BEFORE UPDATE ON public.board_registrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Subject entries per registration
CREATE TABLE public.board_exam_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id UUID NOT NULL REFERENCES public.board_registrations(id) ON DELETE CASCADE,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  paper TEXT,
  theory_max NUMERIC(6,2) NOT NULL DEFAULT 75,
  practical_max NUMERIC(6,2) NOT NULL DEFAULT 25,
  is_elective BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registration_id, subject_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_exam_entries TO authenticated;
GRANT ALL ON public.board_exam_entries TO service_role;
ALTER TABLE public.board_exam_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_entries via reg"
  ON public.board_exam_entries FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.board_registrations r
    WHERE r.id = registration_id
      AND (public.has_campus_access(auth.uid(), r.campus_id) OR public.is_student_owner(auth.uid(), r.student_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.board_registrations r
    WHERE r.id = registration_id AND public.has_campus_access(auth.uid(), r.campus_id)));
CREATE TRIGGER board_entries_upd BEFORE UPDATE ON public.board_exam_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Results per subject entry
CREATE TABLE public.board_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.board_exam_entries(id) ON DELETE CASCADE,
  theory_marks NUMERIC(6,2),
  practical_marks NUMERIC(6,2),
  total_marks NUMERIC(6,2),
  grade TEXT,
  status public.board_result_status NOT NULL DEFAULT 'pending',
  remarks TEXT,
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_results TO authenticated;
GRANT ALL ON public.board_results TO service_role;
ALTER TABLE public.board_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "board_results via reg"
  ON public.board_results FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.board_exam_entries e
    JOIN public.board_registrations r ON r.id = e.registration_id
    WHERE e.id = entry_id
      AND (public.has_campus_access(auth.uid(), r.campus_id) OR public.is_student_owner(auth.uid(), r.student_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.board_exam_entries e
    JOIN public.board_registrations r ON r.id = e.registration_id
    WHERE e.id = entry_id AND public.has_campus_access(auth.uid(), r.campus_id)));
CREATE TRIGGER board_results_upd BEFORE UPDATE ON public.board_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Helper: does a student have outstanding challans (used to gate roll slip/admit card)
CREATE OR REPLACE FUNCTION public.student_has_outstanding_challans(_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fee_challans
    WHERE student_id = _student_id
      AND status IN ('unpaid','partial','overdue')
  );
$$;

CREATE INDEX idx_board_reg_campus_year ON public.board_registrations(campus_id, session_year);
CREATE INDEX idx_board_entries_reg ON public.board_exam_entries(registration_id);
CREATE INDEX idx_board_results_entry ON public.board_results(entry_id);
