-- prevent_core_record_delete is trigger-only; users do not need direct EXECUTE
REVOKE ALL ON FUNCTION public.prevent_core_record_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_core_record_delete() TO service_role;

-- get_public_campuses is intentionally public, but avoid the broad PUBLIC grant
REVOKE ALL ON FUNCTION public.get_public_campuses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campuses(uuid) TO anon, authenticated, service_role;