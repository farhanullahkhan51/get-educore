CREATE OR REPLACE FUNCTION public.sync_fee_challan_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  net_amount numeric := GREATEST(COALESCE(NEW.gross_amount, 0) - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.fine_amount, 0), 0);
BEGIN
  NEW.paid_amount := GREATEST(COALESCE(NEW.paid_amount, 0), 0);
  IF NEW.status = 'waived' THEN
    RETURN NEW;
  ELSIF NEW.paid_amount >= net_amount THEN
    NEW.status := 'paid';
    IF NEW.paid_on IS NULL THEN NEW.paid_on := CURRENT_DATE; END IF;
  ELSIF NEW.due_date < CURRENT_DATE THEN
    NEW.status := 'overdue';
    NEW.paid_on := NULL;
  ELSIF NEW.paid_amount > 0 THEN
    NEW.status := 'partial';
    NEW.paid_on := NULL;
  ELSE
    NEW.status := 'unpaid';
    NEW.paid_on := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_fee_challan_status_trigger ON public.fee_challans;
CREATE TRIGGER sync_fee_challan_status_trigger
BEFORE INSERT OR UPDATE OF gross_amount, discount_amount, fine_amount, paid_amount, due_date, status
ON public.fee_challans
FOR EACH ROW EXECUTE FUNCTION public.sync_fee_challan_status();

CREATE UNIQUE INDEX IF NOT EXISTS attendance_records_identity_idx
ON public.attendance_records (tenant_id, section_id, student_id, date, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.enforce_section_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  section_capacity integer;
  occupied integer;
BEGIN
  IF NEW.section_id IS NULL OR COALESCE(NEW.status, 'active') <> 'active' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.section_id IS NOT DISTINCT FROM OLD.section_id AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT capacity INTO section_capacity FROM public.sections WHERE id = NEW.section_id AND tenant_id = NEW.tenant_id FOR UPDATE;
  IF section_capacity IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO occupied FROM public.students WHERE tenant_id = NEW.tenant_id AND section_id = NEW.section_id AND status = 'active' AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF occupied >= section_capacity THEN RAISE EXCEPTION 'Section capacity of % has been reached', section_capacity USING ERRCODE = 'check_violation'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_section_capacity_trigger ON public.students;
CREATE TRIGGER enforce_section_capacity_trigger
BEFORE INSERT OR UPDATE OF section_id, status
ON public.students
FOR EACH ROW EXECUTE FUNCTION public.enforce_section_capacity();

CREATE OR REPLACE FUNCTION public.dashboard_metrics(_campus uuid DEFAULT NULL::uuid, _since date DEFAULT NULL::date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  t uuid := public.get_user_tenant(auth.uid());
  wide boolean := public.is_super_admin(auth.uid()) OR public.is_platform_owner(auth.uid());
  scope uuid;
  s date := COALESCE(_since, (date_trunc('month', now()) - interval '5 months')::date);
  res jsonb;
BEGIN
  IF t IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF _campus IS NOT NULL THEN
    IF NOT public.has_campus_access(auth.uid(), _campus) THEN RAISE EXCEPTION 'No access to this campus'; END IF;
    scope := _campus;
  ELSIF wide THEN scope := NULL;
  ELSE scope := public.get_user_campus(auth.uid()); END IF;

  WITH st AS (
    SELECT * FROM public.students WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope)
  ), sf AS (
    SELECT * FROM public.staff WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope)
  ), ch AS (
    SELECT *, GREATEST(COALESCE(gross_amount,0)-COALESCE(discount_amount,0)+COALESCE(fine_amount,0),0) net_billed,
      GREATEST(COALESCE(gross_amount,0)-COALESCE(discount_amount,0)+COALESCE(fine_amount,0)-COALESCE(paid_amount,0),0) balance
    FROM public.fee_challans WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope)
  ), att AS (
    SELECT * FROM public.attendance_records WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope) AND date>=s
  ), inq AS (
    SELECT * FROM public.inquiries WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope) AND created_at>=s::timestamptz
  ), months AS (
    SELECT to_char(gs,'YYYY-MM') m FROM generate_series(date_trunc('month',s),date_trunc('month',now()),interval '1 month') gs
  )
  SELECT jsonb_build_object(
    'student_total',(SELECT count(*) FROM st),'active_students',(SELECT count(*) FROM st WHERE COALESCE(status,'active')='active'),
    'staff_total',(SELECT count(*) FROM sf),'active_staff',(SELECT count(*) FROM sf WHERE COALESCE(status,'active')='active'),
    'billed',(SELECT COALESCE(sum(net_billed),0) FROM ch),
    'collected',(SELECT COALESCE(sum(LEAST(COALESCE(paid_amount,0),net_billed)),0) FROM ch),
    'outstanding',(SELECT COALESCE(sum(balance),0) FROM ch),
    'overdue',(SELECT count(*) FROM ch WHERE due_date<CURRENT_DATE AND balance>0 AND status<>'waived'),
    'attendance_marked',(SELECT count(*) FROM att),'attendance_present',(SELECT count(*) FROM att WHERE status IN ('present','late')),
    'inquiry_total',(SELECT count(*) FROM inq),'inquiry_converted',(SELECT count(*) FROM inq WHERE status='converted'),
    'revenue_series',(SELECT COALESCE(jsonb_agg(jsonb_build_object('month',months.m,'billed',COALESCE(r.b,0),'collected',COALESCE(r.p,0)) ORDER BY months.m),'[]'::jsonb) FROM months LEFT JOIN (SELECT to_char(issue_date,'YYYY-MM') m,sum(net_billed) b,sum(LEAST(COALESCE(paid_amount,0),net_billed)) p FROM ch WHERE issue_date IS NOT NULL GROUP BY 1) r ON r.m=months.m),
    'attendance_series',(SELECT COALESCE(jsonb_agg(jsonb_build_object('month',months.m,'rate',CASE WHEN COALESCE(a.total,0)>0 THEN round((a.present::numeric/a.total)*100,1) ELSE 0 END) ORDER BY months.m),'[]'::jsonb) FROM months LEFT JOIN (SELECT to_char(date,'YYYY-MM') m,count(*) total,count(*) FILTER (WHERE status IN ('present','late')) present FROM att GROUP BY 1) a ON a.m=months.m),
    'funnel',(SELECT COALESCE(jsonb_agg(jsonb_build_object('stage',x.stage,'count',COALESCE(c.n,0)) ORDER BY x.ord),'[]'::jsonb) FROM (VALUES ('new',1),('contacted',2),('visited',3),('converted',4),('lost',5)) x(stage,ord) LEFT JOIN (SELECT status::text stage,count(*) n FROM inq GROUP BY 1) c ON c.stage=x.stage),
    'by_program',(SELECT COALESCE(jsonb_agg(jsonb_build_object('name',p.name,'value',p.n) ORDER BY p.n DESC),'[]'::jsonb) FROM (SELECT pr.name,count(st.id) n FROM public.programs pr JOIN st ON st.program_id=pr.id WHERE pr.tenant_id=t GROUP BY pr.name HAVING count(st.id)>0 ORDER BY count(st.id) DESC LIMIT 6) p),
    'per_campus',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'code',c.code,'students',COALESCE(cs.n,0),'staff',COALESCE(cf.n,0),'outstanding',COALESCE(cc.o,0),'collection',CASE WHEN COALESCE(cc.b,0)>0 THEN round((COALESCE(cc.p,0)/cc.b)*100,1) ELSE 0 END,'attendance',CASE WHEN COALESCE(ca.total,0)>0 THEN round((ca.present::numeric/ca.total)*100,1) ELSE 0 END) ORDER BY c.name),'[]'::jsonb) FROM public.campuses c LEFT JOIN (SELECT campus_id,count(*) n FROM st GROUP BY 1) cs ON cs.campus_id=c.id LEFT JOIN (SELECT campus_id,count(*) n FROM sf GROUP BY 1) cf ON cf.campus_id=c.id LEFT JOIN (SELECT campus_id,sum(net_billed) b,sum(LEAST(COALESCE(paid_amount,0),net_billed)) p,sum(balance) o FROM ch GROUP BY 1) cc ON cc.campus_id=c.id LEFT JOIN (SELECT campus_id,count(*) total,count(*) FILTER (WHERE status IN ('present','late')) present FROM att GROUP BY 1) ca ON ca.campus_id=c.id WHERE c.tenant_id=t AND (scope IS NULL OR c.id=scope))
  ) INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.fee_totals(_campus uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t uuid := public.get_user_tenant(auth.uid()); wide boolean := public.is_super_admin(auth.uid()) OR public.is_platform_owner(auth.uid()); scope uuid; res jsonb;
BEGIN
  IF t IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF _campus IS NOT NULL THEN IF NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'No access to this campus'; END IF; scope:=_campus;
  ELSIF wide THEN scope:=NULL; ELSE scope:=public.get_user_campus(auth.uid()); END IF;
  WITH ch AS (SELECT *,GREATEST(COALESCE(gross_amount,0)-COALESCE(discount_amount,0)+COALESCE(fine_amount,0),0) net_billed,GREATEST(COALESCE(gross_amount,0)-COALESCE(discount_amount,0)+COALESCE(fine_amount,0)-COALESCE(paid_amount,0),0) balance FROM public.fee_challans WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope))
  SELECT jsonb_build_object('billed',COALESCE((SELECT sum(net_billed) FROM ch),0),'collected',COALESCE((SELECT sum(LEAST(COALESCE(paid_amount,0),net_billed)) FROM ch),0),'outstanding',COALESCE((SELECT sum(balance) FROM ch),0),'overdue',(SELECT count(*) FROM ch WHERE due_date<CURRENT_DATE AND balance>0 AND status<>'waived'),'defaulters',(SELECT count(DISTINCT student_id) FROM ch WHERE due_date<CURRENT_DATE AND balance>0 AND status<>'waived'),'challan_count',(SELECT count(*) FROM ch)) INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_has_outstanding_challans(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.fee_challans c WHERE c.student_id=_student_id AND c.tenant_id=public.get_user_tenant(auth.uid()) AND c.status<>'waived' AND GREATEST(COALESCE(c.gross_amount,0)-COALESCE(c.discount_amount,0)+COALESCE(c.fine_amount,0)-COALESCE(c.paid_amount,0),0)>0); $$;

CREATE OR REPLACE FUNCTION public.admissions_totals(_campus uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t uuid:=public.get_user_tenant(auth.uid()); wide boolean:=public.is_super_admin(auth.uid()) OR public.is_platform_owner(auth.uid()); scope uuid; res jsonb;
BEGIN
  IF t IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF _campus IS NOT NULL THEN IF NOT public.has_campus_access(auth.uid(),_campus) THEN RAISE EXCEPTION 'No access to this campus'; END IF; scope:=_campus;
  ELSIF wide THEN scope:=NULL; ELSE scope:=public.get_user_campus(auth.uid()); END IF;
  WITH i AS (SELECT * FROM public.inquiries WHERE tenant_id=t AND (scope IS NULL OR campus_id=scope))
  SELECT jsonb_build_object('new',(SELECT count(*) FROM i WHERE status='new'),'active',(SELECT count(*) FROM i WHERE status IN ('new','contacted','visited')),'converted',(SELECT count(*) FROM i WHERE status='converted'),'lost',(SELECT count(*) FROM i WHERE status='lost'),'total',(SELECT count(*) FROM i)) INTO res;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_reporting_summary(_kind text, _days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE t uuid:=public.get_user_tenant(auth.uid()); span integer:=LEAST(GREATEST(COALESCE(_days,30),1),365); res jsonb;
BEGIN
  IF t IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF _kind='attendance' THEN
    SELECT jsonb_build_object('days',span,'records',count(*),'present',count(*) FILTER (WHERE status IN ('present','late')),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n FROM public.attendance_records WHERE tenant_id=t AND date>=CURRENT_DATE-span GROUP BY status) x CROSS JOIN LATERAL (SELECT sum(n) total) z GROUP BY span;
  ELSIF _kind='admissions' THEN
    SELECT jsonb_build_object('total_inquiries',count(*),'converted',count(*) FILTER (WHERE status='converted'),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n FROM public.inquiries WHERE tenant_id=t GROUP BY status) x;
  ELSIF _kind='results' THEN
    SELECT jsonb_build_object('total',count(*),'average_percent',COALESCE(round(avg(overall_percent),2),0),'by_status',COALESCE(jsonb_object_agg(status::text,n),'{}'::jsonb)) INTO res FROM (SELECT status,count(*) n,avg(overall_percent) overall_percent FROM public.report_cards WHERE tenant_id=t GROUP BY status) x;
  ELSE RAISE EXCEPTION 'Unsupported summary kind'; END IF;
  RETURN COALESCE(res,'{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_fee_challan_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_section_capacity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_metrics(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(uuid,date) TO authenticated;
REVOKE ALL ON FUNCTION public.fee_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_totals(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.student_has_outstanding_challans(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_has_outstanding_challans(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admissions_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admissions_totals(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.ai_reporting_summary(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_reporting_summary(text,integer) TO authenticated;