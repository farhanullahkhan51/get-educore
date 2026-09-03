-- Update enforce_tenant_writable to handle DELETE correctly
CREATE OR REPLACE FUNCTION public.enforce_tenant_writable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.tenant_is_writable(COALESCE(NEW.tenant_id, OLD.tenant_id)) THEN
    RAISE EXCEPTION 'Your subscription has ended. Choose a plan to continue adding or editing records.'
      USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

-- Add DELETE triggers to every table that already has an insert/update writable trigger
CREATE TRIGGER trg_assessment_scores_writable_del
  BEFORE DELETE ON public.assessment_scores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_assessments_writable_del
  BEFORE DELETE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_attendance_records_writable_del
  BEFORE DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_campuses_writable_del
  BEFORE DELETE ON public.campuses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_certificates_writable_del
  BEFORE DELETE ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_classes_writable_del
  BEFORE DELETE ON public.classes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_courses_writable_del
  BEFORE DELETE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_fee_challans_writable_del
  BEFORE DELETE ON public.fee_challans
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_inquiries_writable_del
  BEFORE DELETE ON public.inquiries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_programs_writable_del
  BEFORE DELETE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_report_cards_writable_del
  BEFORE DELETE ON public.report_cards
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_sections_writable_del
  BEFORE DELETE ON public.sections
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_staff_writable_del
  BEFORE DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER trg_students_writable_del
  BEFORE DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER enforce_timetable_entries_writable_del
  BEFORE DELETE ON public.timetable_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

CREATE TRIGGER enforce_timetable_periods_writable_del
  BEFORE DELETE ON public.timetable_periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable();

-- Replace broad anonymous campuses policy with a narrow public RPC helper
CREATE OR REPLACE FUNCTION public.get_public_campuses(_tenant_id uuid)
RETURNS TABLE(id uuid, name text, academic_system text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.academic_system::text
  FROM public.campuses c
  WHERE c.tenant_id = _tenant_id
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_campuses(uuid) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS campuses_public_read ON public.campuses;

-- Recreate sensitive-table policies with explicit authenticated role
DROP POLICY IF EXISTS "cert super admin all" ON public.certificates;
DROP POLICY IF EXISTS "cert campus staff read" ON public.certificates;
DROP POLICY IF EXISTS "cert campus admin write" ON public.certificates;
DROP POLICY IF EXISTS "cert student read own" ON public.certificates;

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

DROP POLICY IF EXISTS "cam_reg campus access" ON public.cambridge_registrations;
DROP POLICY IF EXISTS "cam_entry campus access" ON public.cambridge_subject_entries;
DROP POLICY IF EXISTS "cam_res campus access" ON public.cambridge_results;
DROP POLICY IF EXISTS "track_switch campus access" ON public.track_switches;

CREATE POLICY "cam_reg campus access" ON public.cambridge_registrations
  FOR ALL TO authenticated
  USING (public.get_user_tenant(auth.uid()) = tenant_id AND (public.has_campus_access(auth.uid(), campus_id) OR public.is_student_owner(auth.uid(), student_id)))
  WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND public.has_campus_access(auth.uid(), campus_id));

CREATE POLICY "cam_entry campus access" ON public.cambridge_subject_entries
  FOR ALL TO authenticated
  USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
    SELECT 1 FROM public.cambridge_registrations r WHERE r.id = registration_id AND public.has_campus_access(auth.uid(), r.campus_id)
  ))
  WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id);

CREATE POLICY "cam_res campus access" ON public.cambridge_results
  FOR ALL TO authenticated
  USING (public.get_user_tenant(auth.uid()) = tenant_id AND EXISTS (
    SELECT 1 FROM public.cambridge_subject_entries e
    JOIN public.cambridge_registrations r ON r.id = e.registration_id
    WHERE e.id = entry_id AND (public.has_campus_access(auth.uid(), r.campus_id) OR public.is_student_owner(auth.uid(), r.student_id))
  ))
  WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id);

CREATE POLICY "track_switch campus access" ON public.track_switches
  FOR ALL TO authenticated
  USING (public.get_user_tenant(auth.uid()) = tenant_id AND (public.has_campus_access(auth.uid(), campus_id) OR public.is_student_owner(auth.uid(), student_id)))
  WITH CHECK (public.get_user_tenant(auth.uid()) = tenant_id AND public.has_campus_access(auth.uid(), campus_id));

-- Protect core billing/tenancy records from accidental API deletion
CREATE OR REPLACE FUNCTION public.prevent_core_record_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin(auth.uid()) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Deletion of % is not permitted through the API. Contact platform support if required.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$function$;

CREATE TRIGGER trg_tenants_prevent_delete
  BEFORE DELETE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_core_record_delete();

CREATE TRIGGER trg_subscriptions_prevent_delete
  BEFORE DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_core_record_delete();