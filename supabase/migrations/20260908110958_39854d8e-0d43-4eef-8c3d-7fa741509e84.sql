CREATE OR REPLACE FUNCTION public.dashboard_metrics(_campus uuid DEFAULT NULL, _since date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t uuid := public.get_user_tenant(auth.uid());
  wide boolean := public.is_super_admin(auth.uid()) OR public.is_platform_owner(auth.uid());
  scope uuid;
  s date := COALESCE(_since, (date_trunc('month', now()) - interval '5 months')::date);
  res jsonb;
BEGIN
  IF t IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF _campus IS NOT NULL THEN
    IF NOT public.has_campus_access(auth.uid(), _campus) THEN
      RAISE EXCEPTION 'No access to this campus';
    END IF;
    scope := _campus;
  ELSIF wide THEN
    scope := NULL;
  ELSE
    scope := public.get_user_campus(auth.uid());
  END IF;

  WITH st AS (
    SELECT * FROM public.students
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope)
  ), sf AS (
    SELECT * FROM public.staff
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope)
  ), ch AS (
    SELECT *,
      (COALESCE(gross_amount,0) - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) AS net_billed
    FROM public.fee_challans
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope)
  ), att AS (
    SELECT * FROM public.attendance_records
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope) AND date >= s
  ), inq AS (
    SELECT * FROM public.inquiries
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope) AND created_at >= s::timestamptz
  ), months AS (
    SELECT to_char(gs, 'YYYY-MM') AS m
    FROM generate_series(date_trunc('month', s), date_trunc('month', now()), interval '1 month') gs
  )
  SELECT jsonb_build_object(
    'student_total', (SELECT count(*) FROM st),
    'active_students', (SELECT count(*) FROM st WHERE COALESCE(status,'active') = 'active'),
    'staff_total', (SELECT count(*) FROM sf),
    'active_staff', (SELECT count(*) FROM sf WHERE COALESCE(status,'active') = 'active'),
    'billed', (SELECT COALESCE(sum(net_billed),0) FROM ch),
    'collected', (SELECT COALESCE(sum(paid_amount),0) FROM ch),
    'overdue', (SELECT count(*) FROM ch WHERE status = 'overdue'),
    'attendance_marked', (SELECT count(*) FROM att),
    'attendance_present', (SELECT count(*) FROM att WHERE status IN ('present','late')),
    'inquiry_total', (SELECT count(*) FROM inq),
    'inquiry_converted', (SELECT count(*) FROM inq WHERE status = 'converted'),
    'revenue_series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', months.m,
        'billed', COALESCE(r.b,0),
        'collected', COALESCE(r.p,0)
      ) ORDER BY months.m), '[]'::jsonb)
      FROM months
      LEFT JOIN (
        SELECT to_char(issue_date,'YYYY-MM') AS m, sum(net_billed) b, sum(paid_amount) p
        FROM ch WHERE issue_date IS NOT NULL GROUP BY 1
      ) r ON r.m = months.m
    ),
    'attendance_series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', months.m,
        'rate', CASE WHEN COALESCE(a.total,0) > 0
                     THEN round((a.present::numeric / a.total) * 100, 1) ELSE 0 END
      ) ORDER BY months.m), '[]'::jsonb)
      FROM months
      LEFT JOIN (
        SELECT to_char(date,'YYYY-MM') AS m,
               count(*) AS total,
               count(*) FILTER (WHERE status IN ('present','late')) AS present
        FROM att GROUP BY 1
      ) a ON a.m = months.m
    ),
    'funnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', x.stage, 'count', COALESCE(c.n,0)) ORDER BY x.ord), '[]'::jsonb)
      FROM (VALUES ('new',1),('contacted',2),('visited',3),('converted',4),('lost',5)) AS x(stage, ord)
      LEFT JOIN (SELECT status::text AS stage, count(*) n FROM inq GROUP BY 1) c ON c.stage = x.stage
    ),
    'by_program', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('name', p.name, 'value', p.n) ORDER BY p.n DESC), '[]'::jsonb)
      FROM (
        SELECT pr.name, count(st.id) AS n
        FROM public.programs pr
        JOIN st ON st.program_id = pr.id
        WHERE pr.tenant_id = t
        GROUP BY pr.name
        HAVING count(st.id) > 0
        ORDER BY count(st.id) DESC
        LIMIT 6
      ) p
    ),
    'per_campus', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'code', c.code,
        'students', COALESCE(cs.n, 0),
        'staff', COALESCE(cf.n, 0),
        'outstanding', GREATEST(COALESCE(cc.b,0) - COALESCE(cc.p,0), 0),
        'collection', CASE WHEN COALESCE(cc.b,0) > 0 THEN round((cc.p / cc.b) * 100, 1) ELSE 0 END,
        'attendance', CASE WHEN COALESCE(ca.total,0) > 0 THEN round((ca.present::numeric / ca.total) * 100, 1) ELSE 0 END
      ) ORDER BY c.name), '[]'::jsonb)
      FROM public.campuses c
      LEFT JOIN (SELECT campus_id, count(*) n FROM st GROUP BY 1) cs ON cs.campus_id = c.id
      LEFT JOIN (SELECT campus_id, count(*) n FROM sf GROUP BY 1) cf ON cf.campus_id = c.id
      LEFT JOIN (SELECT campus_id, sum(net_billed) b, sum(paid_amount) p FROM ch GROUP BY 1) cc ON cc.campus_id = c.id
      LEFT JOIN (SELECT campus_id, count(*) total, count(*) FILTER (WHERE status IN ('present','late')) present FROM att GROUP BY 1) ca ON ca.campus_id = c.id
      WHERE c.tenant_id = t AND (scope IS NULL OR c.id = scope)
    )
  ) INTO res;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.dashboard_metrics(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fee_totals(_campus uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t uuid := public.get_user_tenant(auth.uid());
  wide boolean := public.is_super_admin(auth.uid()) OR public.is_platform_owner(auth.uid());
  scope uuid;
  res jsonb;
BEGIN
  IF t IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF _campus IS NOT NULL THEN
    IF NOT public.has_campus_access(auth.uid(), _campus) THEN
      RAISE EXCEPTION 'No access to this campus';
    END IF;
    scope := _campus;
  ELSIF wide THEN
    scope := NULL;
  ELSE
    scope := public.get_user_campus(auth.uid());
  END IF;

  WITH ch AS (
    SELECT *,
      (COALESCE(gross_amount,0) - COALESCE(discount_amount,0) + COALESCE(fine_amount,0)) AS net_billed
    FROM public.fee_challans
    WHERE tenant_id = t AND (scope IS NULL OR campus_id = scope)
  )
  SELECT jsonb_build_object(
    'billed', COALESCE((SELECT sum(net_billed) FROM ch), 0),
    'collected', COALESCE((SELECT sum(paid_amount) FROM ch), 0),
    'outstanding', GREATEST(COALESCE((SELECT sum(net_billed) - sum(paid_amount) FROM ch), 0), 0),
    'overdue', (SELECT count(*) FROM ch WHERE status = 'overdue'),
    'defaulters', (SELECT count(DISTINCT student_id) FROM ch WHERE status IN ('unpaid','partial','overdue')),
    'challan_count', (SELECT count(*) FROM ch)
  ) INTO res;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.fee_totals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fee_totals(uuid) TO authenticated;