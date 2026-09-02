-- 1. Plan pricing -----------------------------------------------------------
ALTER TABLE public.plan_tiers
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS price_monthly_usd numeric,
  ADD COLUMN IF NOT EXISTS price_yearly_usd numeric,
  ADD COLUMN IF NOT EXISTS price_monthly_pkr numeric,
  ADD COLUMN IF NOT EXISTS price_yearly_pkr numeric;

GRANT SELECT ON public.plan_tiers TO anon;

DROP POLICY IF EXISTS "Public can read public plan tiers" ON public.plan_tiers;
CREATE POLICY "Public can read public plan tiers"
  ON public.plan_tiers FOR SELECT TO anon
  USING (is_public = true);

-- 2. Subscription billing fields ---------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS payment_channel text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_subscription_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_tenant_unique ON public.subscriptions (tenant_id);

-- 3. Invoices ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_no text NOT NULL UNIQUE,
  plan_tier_id uuid REFERENCES public.plan_tiers(id),
  billing_cycle billing_cycle NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'PKR',
  period_start date,
  period_end date,
  channel text NOT NULL DEFAULT 'bank_transfer',
  status text NOT NULL DEFAULT 'pending',
  proof_url text,
  reference text,
  notes text,
  paid_on date,
  marked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read their invoices" ON public.invoices;
CREATE POLICY "Tenant members read their invoices"
  ON public.invoices FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()) OR public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS "Tenant admins request bank transfer invoices" ON public.invoices;
CREATE POLICY "Tenant admins request bank transfer invoices"
  ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid())
    AND public.has_role(auth.uid(), 'super_admin')
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Tenant admins attach payment proof" ON public.invoices;
CREATE POLICY "Tenant admins attach payment proof"
  ON public.invoices FOR UPDATE TO authenticated
  USING (
    (tenant_id = public.get_user_tenant(auth.uid()) AND public.has_role(auth.uid(), 'super_admin') AND status = 'pending')
    OR public.is_platform_owner(auth.uid())
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant(auth.uid()) OR public.is_platform_owner(auth.uid())
  );

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Signup requests ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_name text NOT NULL,
  contact_name text NOT NULL,
  email text NOT NULL,
  phone text,
  city text,
  requested_slug text NOT NULL,
  academic_system academic_system NOT NULL DEFAULT 'both',
  plan_tier_id uuid REFERENCES public.plan_tiers(id),
  status text NOT NULL DEFAULT 'provisioned',
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.signup_requests TO authenticated;
GRANT ALL ON public.signup_requests TO service_role;

ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform owners read signup requests" ON public.signup_requests;
CREATE POLICY "Platform owners read signup requests"
  ON public.signup_requests FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()) OR tenant_id = public.get_user_tenant(auth.uid()));

-- 5. Workspace address availability (public) ---------------------------------
CREATE OR REPLACE FUNCTION public.slug_available(_slug text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _slug ~ '^[a-z0-9][a-z0-9-]{2,30}$'
    AND _slug NOT IN (
      'admin','app','api','www','educore','auth','portal','platform','dashboard',
      'mail','static','assets','cdn','support','help','billing','status','blog','docs'
    )
    AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.slug = _slug);
$$;

GRANT EXECUTE ON FUNCTION public.slug_available(text) TO anon, authenticated;

-- 6. Billing state for the signed-in user's institution ----------------------
CREATE OR REPLACE FUNCTION public.my_billing_state()
RETURNS TABLE(
  tenant_id uuid,
  tenant_status tenant_status,
  subscription_status subscription_status,
  plan_name text,
  billing_cycle billing_cycle,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  days_left integer,
  read_only boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (SELECT public.get_user_tenant(auth.uid()) AS tid)
  SELECT
    t.id,
    t.status,
    s.status,
    p.name,
    s.billing_cycle,
    s.trial_ends_at,
    s.current_period_end,
    CASE
      WHEN s.status = 'trialing' AND s.trial_ends_at IS NOT NULL
        THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.trial_ends_at - now())) / 86400))::int
      WHEN s.current_period_end IS NOT NULL
        THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.current_period_end - now())) / 86400))::int
      ELSE NULL
    END,
    (
      t.status = 'suspended'
      OR (s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now())
      OR (s.status = 'canceled')
    )
  FROM public.tenants t
  JOIN me ON me.tid = t.id
  LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
  LEFT JOIN public.plan_tiers p ON p.id = s.plan_tier_id;
$$;

GRANT EXECUTE ON FUNCTION public.my_billing_state() TO authenticated;

-- 7. Seed public pricing on the three tiers ----------------------------------
UPDATE public.plan_tiers SET
  description = 'For a single campus getting organised.',
  price_monthly_usd = 49, price_yearly_usd = 490,
  price_monthly_pkr = 14000, price_yearly_pkr = 140000,
  sort_order = 1, is_public = true
WHERE lower(name) = 'starter';

UPDATE public.plan_tiers SET
  description = 'For growing institutions running multiple campuses.',
  price_monthly_usd = 149, price_yearly_usd = 1490,
  price_monthly_pkr = 42000, price_yearly_pkr = 420000,
  sort_order = 2, is_public = true
WHERE lower(name) = 'pro';

UPDATE public.plan_tiers SET
  description = 'Unlimited scale with custom domain and dedicated onboarding.',
  price_monthly_usd = 399, price_yearly_usd = 3990,
  price_monthly_pkr = 112000, price_yearly_pkr = 1120000,
  sort_order = 3, is_public = true
WHERE lower(name) = 'enterprise';

UPDATE public.plan_tiers SET is_public = false WHERE lower(name) = 'professional';