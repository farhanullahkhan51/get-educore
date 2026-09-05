-- 1) Remove blanket EXECUTE from anon/authenticated on all public functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 2) Intentionally public helpers (used by unauthenticated public pages)
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_host(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_campuses(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_programs(uuid) TO anon, authenticated;

-- 3) Helpers required by RLS policies / triggers / app calls for signed-in users
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_campus_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_campus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_student_owner(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_fees(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_of_section(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_of_course_section(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_is_writable(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_of_uid_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.campus_of_uid_text(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_billing_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_has_outstanding_challans(uuid) TO authenticated;
