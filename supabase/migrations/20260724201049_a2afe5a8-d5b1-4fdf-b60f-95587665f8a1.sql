
CREATE TYPE public.certificate_type AS ENUM (
  'character', 'bonafide', 'school_leaving', 'transfer', 'provisional', 'passing', 'participation', 'merit', 'experience', 'custom'
);
CREATE TYPE public.certificate_status AS ENUM ('draft','issued','revoked');

CREATE TABLE public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL REFERENCES public.campuses(id) ON DELETE RESTRICT,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  recipient_name text NOT NULL,
  recipient_ref text,
  type public.certificate_type NOT NULL,
  title text NOT NULL,
  serial_no text NOT NULL,
  issue_date date NOT NULL DEFAULT current_date,
  body text NOT NULL,
  remarks text,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.certificate_status NOT NULL DEFAULT 'issued',
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, serial_no)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.certificates TO authenticated;
GRANT ALL ON public.certificates TO service_role;

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cert super admin all" ON public.certificates
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "cert campus staff read" ON public.certificates
  FOR SELECT TO authenticated
  USING (public.has_campus_access(auth.uid(), campus_id));

CREATE POLICY "cert campus admin write" ON public.certificates
  FOR ALL TO authenticated
  USING (
    public.has_campus_access(auth.uid(), campus_id)
    AND (public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'admissions_officer'))
  )
  WITH CHECK (
    public.has_campus_access(auth.uid(), campus_id)
    AND (public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'admissions_officer'))
  );

CREATE POLICY "cert student read own" ON public.certificates
  FOR SELECT TO authenticated
  USING (student_id IS NOT NULL AND public.is_student_owner(auth.uid(), student_id));

CREATE TRIGGER update_certificates_updated_at
  BEFORE UPDATE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX certificates_tenant_campus_idx ON public.certificates(tenant_id, campus_id);
CREATE INDEX certificates_student_idx ON public.certificates(student_id);
