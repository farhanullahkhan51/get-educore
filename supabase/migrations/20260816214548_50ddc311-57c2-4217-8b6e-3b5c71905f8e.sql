DROP POLICY IF EXISTS "tenants manageable by platform owner" ON public.tenants;
CREATE POLICY "tenants manageable by platform admins"
ON public.tenants FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant_settings manageable by own super_admin or platform owner" ON public.tenant_settings;
CREATE POLICY "tenant_settings manageable by platform admins"
ON public.tenant_settings FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenants TO service_role;
GRANT ALL ON public.tenant_settings TO service_role;