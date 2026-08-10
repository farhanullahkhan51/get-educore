CREATE TABLE public.ai_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL DEFAULT 'chat',
  model TEXT,
  usage_date DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  requests INTEGER NOT NULL DEFAULT 1,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_tenant_date_idx ON public.ai_usage (tenant_id, usage_date);

GRANT SELECT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own tenant AI usage" ON public.ai_usage
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) OR public.has_role(auth.uid(), 'educore_ceo'));

CREATE TABLE public.ai_usage_limits (
  tenant_id UUID NOT NULL PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  monthly_request_cap INTEGER,
  monthly_cost_cap_usd NUMERIC(12,2),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_limits TO authenticated;
GRANT ALL ON public.ai_usage_limits TO service_role;
ALTER TABLE public.ai_usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own tenant AI limits" ON public.ai_usage_limits
FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant(auth.uid()) OR public.has_role(auth.uid(), 'educore_ceo'));

CREATE POLICY "Platform owners manage AI limits" ON public.ai_usage_limits
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'educore_ceo') OR public.is_super_admin(auth.uid()))
WITH CHECK (public.has_role(auth.uid(), 'educore_ceo') OR public.is_super_admin(auth.uid()));

CREATE TRIGGER update_ai_usage_limits_updated_at
BEFORE UPDATE ON public.ai_usage_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();