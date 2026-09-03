-- TENANTS
DROP POLICY IF EXISTS "tenants manageable by platform admins" ON public.tenants;

CREATE POLICY "tenants full access for platform owner"
ON public.tenants FOR ALL TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "tenants readable by their members"
ON public.tenants FOR SELECT TO authenticated
USING (id = public.get_user_tenant(auth.uid()));

CREATE POLICY "tenants updatable by their own super admin"
ON public.tenants FOR UPDATE TO authenticated
USING (id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'super_admin'));

-- TENANT SETTINGS
DROP POLICY IF EXISTS "tenant_settings manageable by platform admins" ON public.tenant_settings;

CREATE POLICY "tenant_settings full access for platform owner"
ON public.tenant_settings FOR ALL TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE POLICY "tenant_settings readable by their members"
ON public.tenant_settings FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "tenant_settings managed by their own super admin"
ON public.tenant_settings FOR ALL TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'super_admin'));