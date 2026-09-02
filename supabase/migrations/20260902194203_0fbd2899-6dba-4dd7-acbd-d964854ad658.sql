-- 1. Merge duplicate Professional tier into Pro
DO $$
DECLARE _pro uuid; _prof uuid;
BEGIN
  SELECT id INTO _pro FROM public.plan_tiers WHERE name = 'Pro' LIMIT 1;
  SELECT id INTO _prof FROM public.plan_tiers WHERE name = 'Professional' LIMIT 1;
  IF _prof IS NOT NULL AND _pro IS NOT NULL THEN
    UPDATE public.tenants SET plan_tier_id = _pro WHERE plan_tier_id = _prof;
    UPDATE public.subscriptions SET plan_tier_id = _pro WHERE plan_tier_id = _prof;
    UPDATE public.invoices SET plan_tier_id = _pro WHERE plan_tier_id = _prof;
    UPDATE public.signup_requests SET plan_tier_id = _pro WHERE plan_tier_id = _prof;
    DELETE FROM public.plan_tiers WHERE id = _prof;
  END IF;
END $$;

-- 2. Explicit features + limits per tier
UPDATE public.plan_tiers SET
  feature_flags = '{
    "admissions": true, "admissions_pipeline": false, "fees": true,
    "bank_reconciliation": false, "payroll": false, "academics": true,
    "board": true, "cambridge": true, "track_switch": false,
    "certificates": true, "certificates_all_templates": false,
    "portal": false, "insights": false, "ai_assistant": false,
    "branding_full": false, "custom_domain": false, "edit_mode": false
  }'::jsonb,
  student_limit = 500, campus_limit = 1, staff_limit = 50, ai_message_limit = 0,
  is_public = true, sort_order = 1
WHERE name = 'Starter';

UPDATE public.plan_tiers SET
  feature_flags = '{
    "admissions": true, "admissions_pipeline": true, "fees": true,
    "bank_reconciliation": true, "payroll": true, "academics": true,
    "board": true, "cambridge": true, "track_switch": true,
    "certificates": true, "certificates_all_templates": true,
    "portal": true, "insights": true, "ai_assistant": true,
    "branding_full": true, "custom_domain": false, "edit_mode": true
  }'::jsonb,
  student_limit = 2500, campus_limit = 3, staff_limit = 300, ai_message_limit = 1000,
  is_public = true, sort_order = 2
WHERE name = 'Pro';

UPDATE public.plan_tiers SET
  feature_flags = '{
    "admissions": true, "admissions_pipeline": true, "fees": true,
    "bank_reconciliation": true, "payroll": true, "academics": true,
    "board": true, "cambridge": true, "track_switch": true,
    "certificates": true, "certificates_all_templates": true,
    "portal": true, "insights": true, "ai_assistant": true,
    "branding_full": true, "custom_domain": true, "edit_mode": true
  }'::jsonb,
  student_limit = NULL, campus_limit = NULL, staff_limit = NULL, ai_message_limit = NULL,
  is_public = true, sort_order = 3
WHERE name = 'Enterprise';

-- 3. Writability check
CREATE OR REPLACE FUNCTION public.tenant_is_writable(_tenant uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.tenants t
    LEFT JOIN public.subscriptions s ON s.tenant_id = t.id
    WHERE t.id = _tenant
      AND (
        t.status = 'suspended'
        OR (s.status = 'trialing' AND s.trial_ends_at IS NOT NULL AND s.trial_ends_at < now())
        OR s.status = 'canceled'
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.tenant_is_writable(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_is_writable(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_tenant_writable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.tenant_is_writable(COALESCE(NEW.tenant_id, OLD.tenant_id)) THEN
    RAISE EXCEPTION 'Your subscription has ended. Choose a plan to continue adding or editing records.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'students','inquiries','staff','fee_challans','attendance_records',
    'assessments','assessment_scores','report_cards','certificates',
    'classes','sections','courses','programs','campuses'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_writable ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_writable BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_writable()',
      tbl, tbl);
  END LOOP;
END $$;

-- 4. Reminder log
CREATE TABLE public.billing_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_reminders_unique ON public.billing_reminders (tenant_id, kind);

GRANT SELECT ON public.billing_reminders TO authenticated;
GRANT ALL ON public.billing_reminders TO service_role;

ALTER TABLE public.billing_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform owner reads reminders"
ON public.billing_reminders FOR SELECT TO authenticated
USING (public.is_platform_owner(auth.uid()));
