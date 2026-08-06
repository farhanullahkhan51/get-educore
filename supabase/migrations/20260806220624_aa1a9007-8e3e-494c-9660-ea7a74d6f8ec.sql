CREATE TABLE public.ui_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ui_layouts_tenant_scope_idx ON public.ui_layouts (tenant_id, scope);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_layouts TO authenticated;
GRANT ALL ON public.ui_layouts TO service_role;

ALTER TABLE public.ui_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read layouts"
ON public.ui_layouts FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can insert layouts"
ON public.ui_layouts FOR INSERT TO authenticated
WITH CHECK (
  (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'campus_admin'))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can update layouts"
ON public.ui_layouts FOR UPDATE TO authenticated
USING (
  (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'campus_admin'))
  OR public.is_super_admin(auth.uid())
)
WITH CHECK (
  (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'campus_admin'))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Admins can delete layouts"
ON public.ui_layouts FOR DELETE TO authenticated
USING (
  (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'campus_admin'))
  OR public.is_super_admin(auth.uid())
);

CREATE TRIGGER trg_ui_layouts_updated
BEFORE UPDATE ON public.ui_layouts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();