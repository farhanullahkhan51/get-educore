REVOKE ALL ON FUNCTION public.get_public_campuses(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campuses(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_programs(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_programs(uuid) TO anon, authenticated, service_role;