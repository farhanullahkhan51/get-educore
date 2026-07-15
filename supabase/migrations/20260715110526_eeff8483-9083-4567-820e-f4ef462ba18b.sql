
-- 1. Public read access for the inquiry form
GRANT SELECT ON public.campuses TO anon;
GRANT SELECT ON public.programs TO anon;

CREATE POLICY "campuses_public_read"
  ON public.campuses FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "programs_public_read"
  ON public.programs FOR SELECT
  TO anon
  USING (true);

-- 2. Grade column on students (auto-filled from inquiry)
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS grade text;
