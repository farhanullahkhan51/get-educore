CREATE TABLE public.ui_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ui_preferences_user_module_key
  ON public.ui_preferences (tenant_id, user_id, module) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX ui_preferences_tenant_module_key
  ON public.ui_preferences (tenant_id, module) WHERE user_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ui_preferences TO authenticated;
GRANT ALL ON public.ui_preferences TO service_role;

ALTER TABLE public.ui_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read own and tenant default layouts"
ON public.ui_preferences FOR SELECT TO authenticated
USING (
  tenant_id = public.get_user_tenant(auth.uid())
  AND (user_id = auth.uid() OR user_id IS NULL)
);

CREATE POLICY "Manage own layouts"
ON public.ui_preferences FOR ALL TO authenticated
USING (user_id = auth.uid() AND tenant_id = public.get_user_tenant(auth.uid()))
WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Admins manage tenant default layouts"
ON public.ui_preferences FOR ALL TO authenticated
USING (
  user_id IS NULL
  AND tenant_id = public.get_user_tenant(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
)
WITH CHECK (
  user_id IS NULL
  AND tenant_id = public.get_user_tenant(auth.uid())
  AND (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(), 'campus_admin'))
);

CREATE TRIGGER trg_ui_preferences_updated
BEFORE UPDATE ON public.ui_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();