
-- Inquiry status pipeline
CREATE TYPE public.inquiry_status AS ENUM ('new', 'contacted', 'visited', 'converted', 'lost');

CREATE TABLE public.inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campus_id UUID REFERENCES public.campuses(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL,
  academic_system academic_system,

  -- Prospective student
  student_name TEXT NOT NULL,
  student_dob DATE,
  student_gender TEXT,
  previous_school TEXT,
  grade_applying_for TEXT,

  -- Guardian
  guardian_name TEXT NOT NULL,
  guardian_relation TEXT,
  guardian_phone TEXT NOT NULL,
  guardian_email TEXT,
  address TEXT,

  notes TEXT,
  source TEXT, -- e.g. "website", "walk-in", "referral", "chatbot"

  status inquiry_status NOT NULL DEFAULT 'new',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inquiries TO authenticated;
GRANT INSERT ON public.inquiries TO anon; -- public inquiry form submission
GRANT ALL ON public.inquiries TO service_role;

ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- Anonymous public may INSERT only (submit an inquiry from the public form).
CREATE POLICY "Public may submit inquiries"
  ON public.inquiries FOR INSERT TO anon
  WITH CHECK (status = 'new' AND converted_student_id IS NULL AND assigned_to IS NULL);

-- Authenticated staff may also insert (walk-ins etc.)
CREATE POLICY "Staff may create inquiries"
  ON public.inquiries FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'campus_admin')
    OR public.has_role(auth.uid(), 'admissions_officer')
  );

-- Read: super admin sees all; campus_admin/admissions_officer see own campus.
CREATE POLICY "Admissions staff may view inquiries"
  ON public.inquiries FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(), 'campus_admin') OR public.has_role(auth.uid(), 'admissions_officer'))
      AND (campus_id IS NULL OR public.has_campus_access(auth.uid(), campus_id))
    )
  );

CREATE POLICY "Admissions staff may update inquiries"
  ON public.inquiries FOR UPDATE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(), 'campus_admin') OR public.has_role(auth.uid(), 'admissions_officer'))
      AND (campus_id IS NULL OR public.has_campus_access(auth.uid(), campus_id))
    )
  );

CREATE POLICY "Admins may delete inquiries"
  ON public.inquiries FOR DELETE TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_role(auth.uid(), 'campus_admin')
  );

CREATE INDEX idx_inquiries_campus_status ON public.inquiries(campus_id, status);
CREATE INDEX idx_inquiries_created_at ON public.inquiries(created_at DESC);

CREATE TRIGGER update_inquiries_updated_at
  BEFORE UPDATE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
