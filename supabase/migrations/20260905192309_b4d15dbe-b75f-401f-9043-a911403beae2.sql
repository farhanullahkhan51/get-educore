CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cap int;
  _plan text;
  _count int;
BEGIN
  SELECT pt.name,
         CASE TG_ARGV[0]
           WHEN 'student_limit' THEN pt.student_limit
           WHEN 'staff_limit'   THEN pt.staff_limit
           WHEN 'campus_limit'  THEN pt.campus_limit
         END
    INTO _plan, _cap
  FROM public.tenants t
  JOIN public.plan_tiers pt ON pt.id = t.plan_tier_id
  WHERE t.id = NEW.tenant_id;

  IF _cap IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id = $1', TG_TABLE_NAME)
    INTO _count USING NEW.tenant_id;

  IF _count >= _cap THEN
    RAISE EXCEPTION 'Your % plan allows up to % %. Upgrade to add more.',
      COALESCE(_plan, 'current'), _cap, TG_ARGV[1]
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_plan_limit ON public.students;
CREATE TRIGGER trg_students_plan_limit
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('student_limit', 'students');

DROP TRIGGER IF EXISTS trg_staff_plan_limit ON public.staff;
CREATE TRIGGER trg_staff_plan_limit
BEFORE INSERT ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('staff_limit', 'staff members');

DROP TRIGGER IF EXISTS trg_campuses_plan_limit ON public.campuses;
CREATE TRIGGER trg_campuses_plan_limit
BEFORE INSERT ON public.campuses
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('campus_limit', 'campuses');

CREATE OR REPLACE FUNCTION public.my_plan_usage()
RETURNS TABLE(
  students_used int, students_cap int,
  staff_used int, staff_cap int,
  campuses_used int, campuses_cap int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT public.get_user_tenant(auth.uid()) AS tid),
  caps AS (
    SELECT pt.student_limit, pt.staff_limit, pt.campus_limit
    FROM public.tenants t
    LEFT JOIN public.plan_tiers pt ON pt.id = t.plan_tier_id
    WHERE t.id = (SELECT tid FROM me)
  )
  SELECT
    (SELECT count(*)::int FROM public.students s WHERE s.tenant_id = (SELECT tid FROM me)),
    (SELECT student_limit FROM caps),
    (SELECT count(*)::int FROM public.staff s WHERE s.tenant_id = (SELECT tid FROM me)),
    (SELECT staff_limit FROM caps),
    (SELECT count(*)::int FROM public.campuses c WHERE c.tenant_id = (SELECT tid FROM me)),
    (SELECT campus_limit FROM caps);
$$;

GRANT EXECUTE ON FUNCTION public.my_plan_usage() TO authenticated;
