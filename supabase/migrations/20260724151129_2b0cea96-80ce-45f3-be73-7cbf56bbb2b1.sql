
-- Enums
CREATE TYPE public.tenant_status AS ENUM ('active','suspended','trial');
CREATE TYPE public.custom_domain_status AS ENUM ('pending','verifying','verified','active','failed');
CREATE TYPE public.billing_cycle AS ENUM ('monthly','yearly');
CREATE TYPE public.subscription_status AS ENUM ('active','past_due','canceled','trialing');

-- plan_tiers
CREATE TABLE public.plan_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  student_limit int,
  campus_limit int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plan_tiers TO authenticated;
GRANT ALL ON public.plan_tiers TO service_role;
ALTER TABLE public.plan_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_tiers readable by authenticated" ON public.plan_tiers FOR SELECT TO authenticated USING (true);
CREATE POLICY "plan_tiers manageable by super_admin" ON public.plan_tiers FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- tenants
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
  custom_domain text UNIQUE,
  custom_domain_status public.custom_domain_status NOT NULL DEFAULT 'pending',
  domain_verification_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  plan_tier_id uuid REFERENCES public.plan_tiers(id) ON DELETE SET NULL,
  status public.tenant_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenants manageable by super_admin" ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- tenant_settings (1-1)
CREATE TABLE public.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  font text,
  letterhead_url text,
  signature_url text,
  email_sender_name text,
  default_currency text NOT NULL DEFAULT 'PKR',
  default_timezone text NOT NULL DEFAULT 'Asia/Karachi',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_settings TO authenticated;
GRANT ALL ON public.tenant_settings TO service_role;
ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_settings manageable by super_admin" ON public.tenant_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- subscriptions
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_tier_id uuid NOT NULL REFERENCES public.plan_tiers(id) ON DELETE RESTRICT,
  billing_cycle public.billing_cycle NOT NULL DEFAULT 'monthly',
  status public.subscription_status NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions manageable by super_admin" ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- updated_at triggers (reuse existing public.update_updated_at_column)
CREATE TRIGGER update_plan_tiers_updated_at BEFORE UPDATE ON public.plan_tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_tenant_settings_updated_at BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed plan tiers
INSERT INTO public.plan_tiers (name, student_limit, campus_limit, feature_flags) VALUES
  ('Starter', 500, 1, '{}'::jsonb),
  ('Pro', 5000, 5, '{}'::jsonb),
  ('Enterprise', NULL, NULL, '{}'::jsonb);

-- Seed default tenant + settings
WITH ent AS (SELECT id FROM public.plan_tiers WHERE name = 'Enterprise')
INSERT INTO public.tenants (name, slug, plan_tier_id, status)
SELECT 'EduCore', 'educore', ent.id, 'active' FROM ent;

INSERT INTO public.tenant_settings (tenant_id)
SELECT id FROM public.tenants WHERE slug = 'educore';
