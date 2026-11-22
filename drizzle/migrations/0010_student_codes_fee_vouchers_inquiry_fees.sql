ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_student_code_key;
DROP INDEX IF EXISTS public.students_student_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS students_tenant_code_key ON public.students (tenant_id, student_code);

CREATE OR REPLACE FUNCTION public.assign_student_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t uuid; _next int;
BEGIN
  _t := coalesce(NEW.tenant_id, (SELECT tenant_id FROM campuses WHERE id = NEW.campus_id));
  NEW.student_code := trim(coalesce(NEW.student_code, ''));
  IF TG_OP = 'INSERT' AND NEW.student_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('student_code:' || _t::text));
    SELECT coalesce(max(student_code::int), 10000) + 1 INTO _next
      FROM students WHERE tenant_id = _t AND student_code ~ '^\d{5}$';
    IF _next > 99999 THEN RAISE EXCEPTION 'No 5-digit student IDs left'; END IF;
    NEW.student_code := _next::text;
  END IF;
  IF NEW.student_code !~ '^\d{5}$' AND (TG_OP = 'INSERT' OR NEW.student_code IS DISTINCT FROM OLD.student_code) THEN
    RAISE EXCEPTION 'Student ID must be exactly 5 digits (numbers only)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS a_assign_student_code ON public.students;
CREATE TRIGGER a_assign_student_code BEFORE INSERT OR UPDATE OF student_code ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.assign_student_code();

CREATE OR REPLACE FUNCTION public.claim_student_account(_code text, _phone text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _p text := regexp_replace(coalesce(_phone,''), '\D', '', 'g');
  _s record; _tenant uuid; _fails int; _other_roles int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  _p := CASE WHEN length(_p) > 10 THEN right(_p, 10) ELSE ltrim(_p, '0') END;
  SELECT count(*) INTO _fails FROM portal_claim_attempts
   WHERE user_id = _uid AND NOT success AND created_at > now() - interval '1 hour';
  IF _fails >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Too many attempts. Please try again in an hour or contact the school office.');
  END IF;
  IF EXISTS (SELECT 1 FROM students WHERE profile_id = _uid) THEN
    RETURN jsonb_build_object('ok', true, 'message', 'Your portal is already active.');
  END IF;
  SELECT count(*) INTO _other_roles FROM user_roles WHERE user_id = _uid AND role <> 'student';
  IF _other_roles > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Staff accounts cannot be linked to a student. Register with a separate email.');
  END IF;
  IF length(_p) >= 9 THEN
    SELECT s.id, s.campus_id INTO _s FROM students s
     WHERE upper(trim(s.student_code)) = upper(trim(coalesce(_code,'')))
       AND s.profile_id IS NULL
       AND (CASE WHEN length(regexp_replace(coalesce(s.guardian_phone,''),'\D','','g')) > 10
                 THEN right(regexp_replace(s.guardian_phone,'\D','','g'),10)
                 ELSE ltrim(regexp_replace(coalesce(s.guardian_phone,''),'\D','','g'),'0') END) = _p
     LIMIT 1;
  END IF;
  IF _s.id IS NULL THEN
    INSERT INTO portal_claim_attempts(user_id, success) VALUES (_uid, false);
    RETURN jsonb_build_object('ok', false, 'message', 'The student code and guardian phone do not match our records, or this student is already registered. Contact the school office.');
  END IF;
  SELECT tenant_id INTO _tenant FROM campuses WHERE id = _s.campus_id;
  PERFORM set_config('educore.portal_claim', '1', true);
  UPDATE profiles SET tenant_id = _tenant, campus_id = _s.campus_id WHERE id = _uid;
  PERFORM set_config('educore.portal_claim', '', true);
  UPDATE students SET profile_id = _uid WHERE id = _s.id AND profile_id IS NULL;
  INSERT INTO user_roles(user_id, role, campus_id, tenant_id)
    SELECT _uid, 'student', _s.campus_id, _tenant
    WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = 'student');
  INSERT INTO portal_claim_attempts(user_id, success) VALUES (_uid, true);
  RETURN jsonb_build_object('ok', true, 'message', 'Portal activated.');
END;
$function$;

ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS fee_plan jsonb;
ALTER TABLE public.fee_challans ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.fee_challans ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES public.fee_challans(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.roll_challans_into(_target uuid, _ids uuid[])
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _c record; _total numeric := 0; _lines jsonb := '[]'::jsonb; _bal numeric;
BEGIN
  SELECT * INTO _t FROM fee_challans WHERE id = _target FOR UPDATE;
  IF _t.id IS NULL THEN RAISE EXCEPTION 'Voucher not found'; END IF;
  IF NOT can_manage_fees(auth.uid(), _t.campus_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  FOR _c IN SELECT * FROM fee_challans
     WHERE id = ANY(_ids) AND id <> _target AND student_id = _t.student_id
       AND merged_into IS NULL AND status IN ('unpaid','partial','overdue')
     ORDER BY due_date FOR UPDATE LOOP
    _bal := greatest(_c.gross_amount - _c.discount_amount + _c.fine_amount - _c.paid_amount, 0);
    IF _bal <= 0 THEN CONTINUE; END IF;
    _total := _total + _bal;
    _lines := _lines || jsonb_build_object('label', 'Arrears ' || coalesce(_c.period_label, _c.challan_no),
      'amount', _bal, 'ref', _c.challan_no);
    UPDATE fee_challans SET merged_into = _target, status = 'waived',
      notes = trim(coalesce(notes,'') || ' Moved to ' || _t.challan_no) WHERE id = _c.id;
  END LOOP;
  IF _total > 0 THEN
    UPDATE fee_challans SET gross_amount = gross_amount + _total, line_items = coalesce(line_items,'[]'::jsonb) || _lines
     WHERE id = _target;
  END IF;
  RETURN _total;
END $$;

CREATE OR REPLACE FUNCTION public.merge_challans(_ids uuid[], _due date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _f record; _new uuid; _n int;
BEGIN
  SELECT * INTO _f FROM fee_challans WHERE id = ANY(_ids) ORDER BY due_date LIMIT 1;
  IF _f.id IS NULL OR array_length(_ids,1) < 2 THEN RAISE EXCEPTION 'Select at least two vouchers'; END IF;
  IF NOT can_manage_fees(auth.uid(), _f.campus_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM fee_challans WHERE id = ANY(_ids) AND student_id <> _f.student_id) THEN
    RAISE EXCEPTION 'All vouchers must belong to the same student';
  END IF;
  SELECT count(*) + 1 INTO _n FROM fee_challans WHERE tenant_id = _f.tenant_id AND challan_no LIKE 'CMB-%';
  INSERT INTO fee_challans (challan_no, campus_id, tenant_id, student_id, category, period_label, issue_date, due_date,
     gross_amount, discount_amount, fine_amount, paid_amount, status, created_by, notes)
  VALUES ('CMB-' || to_char(now(),'YYMM') || '-' || lpad(_n::text, 4, '0'), _f.campus_id, _f.tenant_id, _f.student_id,
     'tuition', 'Combined voucher', CURRENT_DATE, coalesce(_due, CURRENT_DATE + 7), 0, 0, 0, 0, 'unpaid', auth.uid(), 'Combined voucher')
  RETURNING id INTO _new;
  IF public.roll_challans_into(_new, _ids) <= 0 THEN RAISE EXCEPTION 'Nothing left to pay on the selected vouchers'; END IF;
  RETURN _new;
END $$;

CREATE OR REPLACE FUNCTION public.carry_forward_balances(_targets uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _ids uuid[]; _count int := 0;
BEGIN
  FOR _t IN SELECT * FROM fee_challans WHERE id = ANY(_targets) LOOP
    SELECT array_agg(id) INTO _ids FROM fee_challans
     WHERE student_id = _t.student_id AND id <> ALL(_targets) AND merged_into IS NULL
       AND status IN ('unpaid','partial','overdue') AND due_date < _t.due_date;
    IF _ids IS NOT NULL AND public.roll_challans_into(_t.id, _ids) > 0 THEN _count := _count + 1; END IF;
  END LOOP;
  RETURN _count;
END $$;

REVOKE EXECUTE ON FUNCTION public.roll_challans_into(uuid, uuid[]) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.merge_challans(uuid[], date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.carry_forward_balances(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.roll_challans_into(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_challans(uuid[], date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.carry_forward_balances(uuid[]) TO authenticated;

DROP POLICY IF EXISTS campuses_select_all_authenticated ON public.campuses;
CREATE POLICY campuses_select_scoped ON public.campuses FOR SELECT TO authenticated
  USING (get_user_tenant(auth.uid()) = tenant_id
     AND (is_super_admin(auth.uid()) OR is_platform_owner(auth.uid()) OR id = get_user_campus(auth.uid())));