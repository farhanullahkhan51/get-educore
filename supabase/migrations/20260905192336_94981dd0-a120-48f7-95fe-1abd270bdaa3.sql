REVOKE ALL ON FUNCTION public.my_plan_usage() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_plan_limit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_plan_usage() TO authenticated;
