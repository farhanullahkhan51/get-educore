DROP POLICY IF EXISTS "Tenant admins attach payment proof" ON public.invoices;

CREATE POLICY "Tenant admins attach payment proof"
ON public.invoices
FOR UPDATE
TO authenticated
USING (
  (tenant_id = public.get_user_tenant(auth.uid())
   AND public.has_role(auth.uid(), 'super_admin'::app_role)
   AND status = 'pending')
  OR public.is_platform_owner(auth.uid())
)
WITH CHECK (
  (tenant_id = public.get_user_tenant(auth.uid())
   AND public.has_role(auth.uid(), 'super_admin'::app_role)
   AND status = 'pending')
  OR public.is_platform_owner(auth.uid())
);