REVOKE EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_section_seat(uuid, integer, uuid) TO authenticated;