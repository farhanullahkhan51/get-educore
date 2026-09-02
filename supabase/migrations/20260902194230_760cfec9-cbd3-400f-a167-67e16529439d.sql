REVOKE EXECUTE ON FUNCTION public.tenant_is_writable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_is_writable(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_tenant_writable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_writable() TO service_role;
