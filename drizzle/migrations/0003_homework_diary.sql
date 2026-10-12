CREATE TABLE public.homework_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  campus_id uuid,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'homework' CHECK (kind IN ('homework','classwork','reading','project','test','note')),
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  assigned_on date NOT NULL DEFAULT current_date,
  due_on date,
  attachment_url text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_on IS NULL OR due_on >= assigned_on)
);
CREATE INDEX homework_section_date_idx ON public.homework_entries(section_id, assigned_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_entries TO authenticated;
GRANT ALL ON public.homework_entries TO service_role;
ALTER TABLE public.homework_entries ENABLE ROW LEVEL SECURITY;

-- Scope always comes from the section, never from the client.
CREATE OR REPLACE FUNCTION public.homework_fill_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT s.tenant_id, s.campus_id INTO NEW.tenant_id, NEW.campus_id
  FROM public.sections s WHERE s.id = NEW.section_id;
  IF NEW.campus_id IS NULL THEN RAISE EXCEPTION 'Unknown section'; END IF;
  IF TG_OP = 'INSERT' THEN NEW.created_by := auth.uid(); ELSE NEW.created_by := OLD.created_by; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER homework_fill_scope BEFORE INSERT OR UPDATE ON public.homework_entries
FOR EACH ROW EXECUTE FUNCTION public.homework_fill_scope();

CREATE OR REPLACE FUNCTION public.can_manage_homework(_user uuid, _section uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sections s
    WHERE s.id = _section
      AND s.tenant_id = public.get_user_tenant(_user)
      AND public.tenant_is_writable(s.tenant_id)
      AND (
        public.is_super_admin(_user)
        OR (public.has_role(_user,'campus_admin') AND s.campus_id = public.get_user_campus(_user))
        OR (public.has_role(_user,'teacher') AND s.campus_id = public.get_user_campus(_user))
      )
  )
$$;

CREATE POLICY homework_select ON public.homework_entries FOR SELECT TO authenticated USING (
  tenant_id = public.get_user_tenant(auth.uid()) AND (
    public.is_super_admin(auth.uid())
    OR ((public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'teacher'))
        AND campus_id = public.get_user_campus(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.students st WHERE st.profile_id = auth.uid() AND st.section_id = homework_entries.section_id)
  )
);
CREATE POLICY homework_insert ON public.homework_entries FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_homework(auth.uid(), section_id));
CREATE POLICY homework_update ON public.homework_entries FOR UPDATE TO authenticated
  USING (public.can_manage_homework(auth.uid(), section_id) AND (created_by = auth.uid() OR NOT public.has_role(auth.uid(),'teacher') OR public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')))
  WITH CHECK (public.can_manage_homework(auth.uid(), section_id));
CREATE POLICY homework_delete ON public.homework_entries FOR DELETE TO authenticated
  USING (public.can_manage_homework(auth.uid(), section_id) AND (created_by = auth.uid() OR public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')));

CREATE TRIGGER homework_tenant_writable BEFORE INSERT OR UPDATE OR DELETE ON public.homework_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();