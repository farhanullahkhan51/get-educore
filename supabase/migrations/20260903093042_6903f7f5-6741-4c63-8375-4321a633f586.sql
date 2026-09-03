CREATE OR REPLACE FUNCTION public.get_public_programs(_campus_id uuid)
RETURNS TABLE(id uuid, name text, academic_system text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name, p.academic_system::text
  FROM public.programs p
  WHERE p.campus_id = _campus_id
  ORDER BY p.name;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_programs(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_programs(uuid) FROM PUBLIC;

DROP POLICY IF EXISTS programs_public_read ON public.programs;
REVOKE SELECT ON public.programs FROM anon;