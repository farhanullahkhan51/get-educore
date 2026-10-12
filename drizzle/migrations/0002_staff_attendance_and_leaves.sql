
CREATE TABLE public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','late','half_day','on_leave')),
  check_in time,
  check_out time,
  note text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, date)
);
CREATE INDEX staff_attendance_campus_date ON public.staff_attendance (campus_id, date);

CREATE TABLE public.staff_leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  campus_id uuid NOT NULL,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type text NOT NULL DEFAULT 'casual' CHECK (leave_type IN ('casual','sick','duty','maternity','unpaid','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX staff_leaves_campus_dates ON public.staff_leaves (campus_id, start_date, end_date);

-- tenant/campus always come from the staff record, never from the client
CREATE OR REPLACE FUNCTION public.staff_hr_fill_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT s.tenant_id, s.campus_id INTO NEW.tenant_id, NEW.campus_id FROM public.staff s WHERE s.id = NEW.staff_id;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'Unknown staff member'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.can_manage_staff_hr(_user uuid, _campus uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR (public.has_role(_user, 'campus_admin') AND public.get_user_campus(_user) = _campus)
$$;

CREATE OR REPLACE FUNCTION public.is_own_staff(_user uuid, _staff uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff WHERE id = _staff AND profile_id = _user)
$$;

CREATE TRIGGER trg_staff_attendance_scope BEFORE INSERT OR UPDATE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.staff_hr_fill_scope();
CREATE TRIGGER trg_staff_leaves_scope BEFORE INSERT OR UPDATE ON public.staff_leaves FOR EACH ROW EXECUTE FUNCTION public.staff_hr_fill_scope();
CREATE TRIGGER trg_staff_attendance_writable BEFORE INSERT OR UPDATE OR DELETE ON public.staff_attendance FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();
CREATE TRIGGER trg_staff_leaves_writable BEFORE INSERT OR UPDATE OR DELETE ON public.staff_leaves FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_attendance TO authenticated;
GRANT ALL ON public.staff_attendance TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_leaves TO authenticated;
GRANT ALL ON public.staff_leaves TO service_role;

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_leaves ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_att_select ON public.staff_attendance FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.can_manage_staff_hr(auth.uid(), campus_id) OR public.is_own_staff(auth.uid(), staff_id)));
CREATE POLICY staff_att_manage ON public.staff_attendance FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_staff_hr(auth.uid(), campus_id))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_staff_hr(auth.uid(), campus_id));

CREATE POLICY staff_leave_select ON public.staff_leaves FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.can_manage_staff_hr(auth.uid(), campus_id) OR public.is_own_staff(auth.uid(), staff_id)));
CREATE POLICY staff_leave_manage ON public.staff_leaves FOR ALL TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_staff_hr(auth.uid(), campus_id))
  WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.can_manage_staff_hr(auth.uid(), campus_id));
CREATE POLICY staff_leave_apply_own ON public.staff_leaves FOR INSERT TO authenticated
  WITH CHECK (public.is_own_staff(auth.uid(), staff_id) AND status = 'pending' AND reviewed_by IS NULL);
CREATE POLICY staff_leave_cancel_own ON public.staff_leaves FOR UPDATE TO authenticated
  USING (public.is_own_staff(auth.uid(), staff_id) AND status = 'pending')
  WITH CHECK (public.is_own_staff(auth.uid(), staff_id) AND status IN ('pending','cancelled') AND reviewed_by IS NULL);
