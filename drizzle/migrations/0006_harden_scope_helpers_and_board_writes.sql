CREATE OR REPLACE FUNCTION public.is_staff_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'))
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role <> 'student');
$$;
REVOKE EXECUTE ON FUNCTION public.is_staff_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles
  WHERE id = _user_id
    AND (_user_id = auth.uid() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'))
$$;

CREATE OR REPLACE FUNCTION public.get_user_campus(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT campus_id FROM public.profiles
  WHERE id = _user_id
    AND (_user_id = auth.uid() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'))
$$;

CREATE OR REPLACE FUNCTION public.has_campus_access(_user_id uuid, _campus_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'))
     AND (public.is_super_admin(_user_id) OR public.get_user_campus(_user_id) = _campus_id);
$$;

CREATE OR REPLACE FUNCTION public.is_student_owner(_user_id uuid, _student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (_user_id = auth.uid() OR coalesce(auth.role(), '') NOT IN ('anon', 'authenticated'))
     AND EXISTS (SELECT 1 FROM public.students st WHERE st.id = _student_id AND st.profile_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.campus_of_uid_text(_uid_text text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _campus uuid; _tenant uuid;
BEGIN
  BEGIN _uid := _uid_text::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
  SELECT campus_id, tenant_id INTO _campus, _tenant FROM public.profiles WHERE id = _uid;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated')
     AND _tenant IS DISTINCT FROM (SELECT p.tenant_id FROM public.profiles p WHERE p.id = auth.uid()) THEN
    RETURN NULL;
  END IF;
  RETURN _campus;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_has_outstanding_challans(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fee_challans c
    WHERE c.student_id = _student_id
      AND c.tenant_id = public.get_user_tenant(auth.uid())
      AND (public.is_student_owner(auth.uid(), _student_id)
           OR (public.is_staff_user(auth.uid()) AND public.has_campus_access(auth.uid(), c.campus_id)))
      AND c.status <> 'waived'
      AND GREATEST(COALESCE(c.gross_amount,0)-COALESCE(c.discount_amount,0)+COALESCE(c.fine_amount,0)-COALESCE(c.paid_amount,0),0) > 0);
$$;

CREATE OR REPLACE FUNCTION public.fee_totals_monthly(_campus uuid DEFAULT NULL::uuid, _months integer DEFAULT 6)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _tenant uuid := public.get_user_tenant(auth.uid());
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL OR NOT public.is_staff_user(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _months < 1 OR _months > 36 THEN RAISE EXCEPTION 'Months must be between 1 and 36'; END IF;
  IF _campus IS NOT NULL AND NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _campus IS NULL AND NOT public.is_super_admin(auth.uid()) THEN
    _campus := public.get_user_campus(auth.uid());
    IF _campus IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('month',to_char(m.month_start,'YYYY-MM'),'billed',coalesce(x.billed,0),'collected',coalesce(x.collected,0),'outstanding',coalesce(x.outstanding,0),'overdue',coalesce(x.overdue,0)) ORDER BY m.month_start),'[]'::jsonb)
  INTO _result
  FROM generate_series(date_trunc('month',current_date)-((_months-1)||' months')::interval,date_trunc('month',current_date),'1 month') m(month_start)
  LEFT JOIN LATERAL (
    SELECT sum(gross_amount+fine_amount-discount_amount) billed,
      sum(paid_amount) collected,
      sum(greatest(gross_amount+fine_amount-discount_amount-paid_amount,0)) outstanding,
      count(*) FILTER (WHERE due_date<current_date AND status<>'waived' AND gross_amount+fine_amount-discount_amount-paid_amount>0) overdue
    FROM public.fee_challans f
    WHERE f.tenant_id=_tenant AND (_campus IS NULL OR f.campus_id=_campus)
      AND f.issue_date>=m.month_start::date AND f.issue_date<(m.month_start+interval '1 month')::date
  ) x ON true;
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_reporting_summary(_feature text, _campus uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _tenant uuid := public.get_user_tenant(auth.uid());
  _result jsonb;
BEGIN
  IF auth.uid() IS NULL OR _tenant IS NULL OR NOT public.is_staff_user(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _campus IS NOT NULL AND NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _campus IS NULL AND NOT public.is_super_admin(auth.uid()) THEN
    _campus := public.get_user_campus(auth.uid());
    IF _campus IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
  IF _feature='attendance' THEN
    SELECT jsonb_build_object('total',count(*),'present',count(*) FILTER (WHERE status='present'),'absent',count(*) FILTER (WHERE status='absent'),'late',count(*) FILTER (WHERE status='late'),'leave',count(*) FILTER (WHERE status='leave')) INTO _result FROM public.attendance_records WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSIF _feature='admissions' THEN
    SELECT jsonb_build_object('total',count(*),'new',count(*) FILTER (WHERE status='new'),'contacted',count(*) FILTER (WHERE status='contacted'),'visited',count(*) FILTER (WHERE status='visited'),'converted',count(*) FILTER (WHERE status='converted'),'lost',count(*) FILTER (WHERE status='lost')) INTO _result FROM public.inquiries WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSIF _feature='results' THEN
    SELECT jsonb_build_object('report_cards',count(*),'published',count(*) FILTER (WHERE status='published'),'draft',count(*) FILTER (WHERE status='draft'),'locked',count(*) FILTER (WHERE status='locked'),'average_percent',round(coalesce(avg(overall_percent),0),2)) INTO _result FROM public.report_cards WHERE tenant_id=_tenant AND (_campus IS NULL OR campus_id=_campus);
  ELSE RAISE EXCEPTION 'Unsupported reporting feature'; END IF;
  RETURN coalesce(_result,'{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_reporting_summary(_kind text, _days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE t uuid:=public.get_user_tenant(auth.uid()); span integer:=LEAST(GREATEST(COALESCE(_days,30),1),365); res jsonb; cmp uuid;
BEGIN
  IF t IS NULL OR NOT public.is_staff_user(auth.uid()) THEN RETURN '{}'::jsonb; END IF;
  IF NOT public.is_super_admin(auth.uid()) THEN
    cmp := public.get_user_campus(auth.uid());
    IF cmp IS NULL THEN RETURN '{}'::jsonb; END IF;
  END IF;
  IF _kind='attendance' THEN
    SELECT jsonb_build_object('days',span,'records',sum(n),'present',sum(n) FILTER (WHERE status IN ('present','late')),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n FROM public.attendance_records WHERE tenant_id=t AND (cmp IS NULL OR campus_id=cmp) AND date>=CURRENT_DATE-span GROUP BY status) x;
  ELSIF _kind='admissions' THEN
    SELECT jsonb_build_object('total_inquiries',sum(n),'converted',sum(n) FILTER (WHERE status='converted'),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n FROM public.inquiries WHERE tenant_id=t AND (cmp IS NULL OR campus_id=cmp) GROUP BY status) x;
  ELSIF _kind='results' THEN
    SELECT jsonb_build_object('total',sum(n),'average_percent',COALESCE(round(sum(overall_percent*n)/NULLIF(sum(n),0),2),0),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n,avg(overall_percent) overall_percent FROM public.report_cards WHERE tenant_id=t AND (cmp IS NULL OR campus_id=cmp) GROUP BY status) x;
  ELSE RAISE EXCEPTION 'Unsupported summary kind'; END IF;
  RETURN COALESCE(res,'{}'::jsonb);
END;
$function$;

CREATE POLICY board_reg_staff_only_ins ON public.board_registrations AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_reg_staff_only_upd ON public.board_registrations AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_staff_user(auth.uid())) WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_reg_staff_only_del ON public.board_registrations AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_staff_user(auth.uid()));
CREATE POLICY board_entry_staff_only_ins ON public.board_exam_entries AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_entry_staff_only_upd ON public.board_exam_entries AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_staff_user(auth.uid())) WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_entry_staff_only_del ON public.board_exam_entries AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_staff_user(auth.uid()));
CREATE POLICY board_result_staff_only_ins ON public.board_results AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_result_staff_only_upd ON public.board_results AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_staff_user(auth.uid())) WITH CHECK (public.is_staff_user(auth.uid()));
CREATE POLICY board_result_staff_only_del ON public.board_results AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_staff_user(auth.uid()));

CREATE OR REPLACE FUNCTION public.expenses_fill_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE _n int;
BEGIN
  SELECT c.tenant_id INTO NEW.tenant_id FROM public.campuses c WHERE c.id = NEW.campus_id;
  IF NEW.tenant_id IS NULL THEN RAISE EXCEPTION 'Unknown campus'; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    PERFORM pg_advisory_xact_lock(hashtext('expense-voucher-' || NEW.tenant_id::text));
    SELECT count(*) + 1 INTO _n FROM public.expenses WHERE tenant_id = NEW.tenant_id
      AND voucher_no LIKE 'EXP-' || to_char(NEW.expense_date,'YYYY') || '-%';
    NEW.voucher_no := 'EXP-' || to_char(NEW.expense_date,'YYYY') || '-' || lpad(_n::text, 4, '0');
    IF NEW.status <> 'draft' THEN NEW.status := 'draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.paid_at := NULL;
  ELSE
    NEW.created_by := OLD.created_by; NEW.voucher_no := OLD.voucher_no;
    IF OLD.status = 'paid' AND (NEW.amount <> OLD.amount OR NEW.tax_amount <> OLD.tax_amount OR NEW.status <> 'paid' OR NEW.campus_id <> OLD.campus_id OR NEW.payment_mode <> OLD.payment_mode OR NEW.entry_type <> OLD.entry_type) THEN
      RAISE EXCEPTION 'Paid vouchers are locked';
    END IF;
    IF OLD.status IN ('approved','paid') AND (NEW.amount <> OLD.amount OR NEW.tax_amount <> OLD.tax_amount OR NEW.payee IS DISTINCT FROM OLD.payee) THEN
      RAISE EXCEPTION 'Approved vouchers cannot change amount or payee; send back to draft first';
    END IF;
    IF NEW.status = 'paid' AND OLD.status NOT IN ('approved','paid') THEN
      RAISE EXCEPTION 'Approve the voucher before marking it paid';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status IN ('approved','rejected') THEN
        IF auth.uid() IS NOT NULL AND auth.uid() = OLD.created_by AND NOT public.is_super_admin(auth.uid()) THEN
          RAISE EXCEPTION 'You cannot approve or reject a voucher you raised; another officer must review it';
        END IF;
        NEW.approved_by := auth.uid(); NEW.approved_at := now();
      END IF;
      IF NEW.status = 'paid' THEN NEW.paid_at := now(); END IF;
      IF NEW.status = 'draft' THEN NEW.approved_by := NULL; NEW.approved_at := NULL; END IF;
    ELSE
      NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at; NEW.paid_at := OLD.paid_at;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;

DROP POLICY IF EXISTS "Public read branding logos" ON storage.objects;
CREATE POLICY "Tenant read own branding" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'branding'
  AND (public.is_platform_owner(auth.uid())
       OR (public.get_user_tenant(auth.uid()))::text = (storage.foldername(name))[1])
);