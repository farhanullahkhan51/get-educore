-- Trigger-only functions: never called directly, revoke all API execution
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_tenant_writable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Internal helpers used by RLS policies and signed-in flows: authenticated + service_role only
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_campus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_campus(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_user_tenant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_campus_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_campus_access(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.can_manage_fees(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_fees(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.teacher_of_section(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_of_section(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.teacher_of_course_section(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_of_course_section(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_student_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_student_owner(uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.student_has_outstanding_challans(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_has_outstanding_challans(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tenant_is_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_is_writable(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.campus_of_uid_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campus_of_uid_text(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tenant_of_uid_text(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_of_uid_text(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.my_billing_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_billing_state() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) TO authenticated, service_role;

-- Intentionally public: branding resolution and signup slug check (no sensitive data)
GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_host(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.slug_available(text) TO anon, authenticated, service_role;