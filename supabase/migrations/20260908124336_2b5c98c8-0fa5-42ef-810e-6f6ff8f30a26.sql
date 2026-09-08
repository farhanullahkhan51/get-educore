REVOKE ALL ON FUNCTION public.sync_fee_challan_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_section_capacity() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "cert campus staff read" ON public.certificates;
DROP POLICY IF EXISTS "cert campus admin write" ON public.certificates;
DROP POLICY IF EXISTS "cert super admin all" ON public.certificates;
CREATE POLICY "cert tenant staff read" ON public.certificates FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "cert tenant admin insert" ON public.certificates FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')) AND public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "cert tenant admin update" ON public.certificates FOR UPDATE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')) AND public.has_campus_access(auth.uid(), campus_id))
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')) AND public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "cert tenant admin delete" ON public.certificates FOR DELETE TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin')) AND public.has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "Manage seating" ON public.section_seats;
DROP POLICY IF EXISTS "View seating for accessible campuses" ON public.section_seats;
CREATE POLICY "View tenant seating" ON public.section_seats FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_campus_access(auth.uid(), campus_id));
CREATE POLICY "Manage tenant seating" ON public.section_seats FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'teacher')) AND public.has_campus_access(auth.uid(), campus_id))
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'campus_admin') OR public.has_role(auth.uid(),'teacher')) AND public.has_campus_access(auth.uid(), campus_id));

DROP POLICY IF EXISTS "plan_tiers readable by authenticated" ON public.plan_tiers;
CREATE POLICY "plan tiers visible to relevant users" ON public.plan_tiers FOR SELECT TO authenticated
USING (is_public OR public.is_platform_owner(auth.uid()) OR id = (SELECT t.plan_tier_id FROM public.tenants t WHERE t.id = public.get_user_tenant(auth.uid())));