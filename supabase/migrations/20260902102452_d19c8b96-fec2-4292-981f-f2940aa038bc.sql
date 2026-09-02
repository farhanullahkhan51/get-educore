ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS academic_system public.academic_system NOT NULL DEFAULT 'both';

ALTER TABLE public.plan_tiers
  ADD COLUMN IF NOT EXISTS staff_limit integer,
  ADD COLUMN IF NOT EXISTS ai_message_limit integer,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

INSERT INTO public.plan_tiers (name, student_limit, campus_limit, staff_limit, ai_message_limit, sort_order, feature_flags)
SELECT 'Starter', 500, 1, 50, 0, 1, '{
  "admissions": true, "admissions_pipeline": false, "fees": true, "bank_reconciliation": false,
  "payroll": false, "academics": true, "board": true, "cambridge": false, "track_switch": false,
  "certificates": true, "certificates_all_templates": false, "portal": false, "insights": false,
  "ai_assistant": false, "branding_full": false, "custom_domain": false, "edit_mode": false
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.plan_tiers WHERE lower(name) = 'starter');

INSERT INTO public.plan_tiers (name, student_limit, campus_limit, staff_limit, ai_message_limit, sort_order, feature_flags)
SELECT 'Professional', 2500, 3, 300, 1000, 2, '{
  "admissions": true, "admissions_pipeline": true, "fees": true, "bank_reconciliation": true,
  "payroll": false, "academics": true, "board": true, "cambridge": true, "track_switch": true,
  "certificates": true, "certificates_all_templates": true, "portal": true, "insights": true,
  "ai_assistant": true, "branding_full": true, "custom_domain": false, "edit_mode": true
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.plan_tiers WHERE lower(name) = 'professional');

INSERT INTO public.plan_tiers (name, student_limit, campus_limit, staff_limit, ai_message_limit, sort_order, feature_flags)
SELECT 'Enterprise', NULL, NULL, NULL, 10000, 3, '{
  "admissions": true, "admissions_pipeline": true, "fees": true, "bank_reconciliation": true,
  "payroll": true, "academics": true, "board": true, "cambridge": true, "track_switch": true,
  "certificates": true, "certificates_all_templates": true, "portal": true, "insights": true,
  "ai_assistant": true, "branding_full": true, "custom_domain": true, "edit_mode": true
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.plan_tiers WHERE lower(name) = 'enterprise');

DROP FUNCTION IF EXISTS public.resolve_tenant_by_host(text);

CREATE FUNCTION public.resolve_tenant_by_host(_host text)
 RETURNS TABLE(id uuid, name text, slug text, status public.tenant_status, custom_domain text, logo_url text, favicon_url text, primary_color text, secondary_color text, accent_color text, font text, letterhead_url text, signature_url text, email_sender_name text, default_currency text, default_timezone text, academic_system public.academic_system, plan_name text, feature_flags jsonb, student_limit integer, campus_limit integer, staff_limit integer, ai_message_limit integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH host_norm AS (
    SELECT lower(regexp_replace(coalesce(_host, ''), '^www\.', '')) AS h
  ),
  sub AS (
    SELECT split_part((SELECT h FROM host_norm), '.', 1) AS s
  ),
  matched AS (
    SELECT t.*
    FROM public.tenants t, host_norm, sub
    WHERE t.status = 'active'
      AND (
        lower(t.custom_domain) = host_norm.h
        OR t.slug = sub.s
      )
    ORDER BY (lower(t.custom_domain) = host_norm.h) DESC
    LIMIT 1
  ),
  fallback AS (
    SELECT t.* FROM public.tenants t WHERE t.slug = 'educore' LIMIT 1
  ),
  chosen AS (
    SELECT * FROM matched
    UNION ALL
    SELECT * FROM fallback WHERE NOT EXISTS (SELECT 1 FROM matched)
    LIMIT 1
  )
  SELECT
    c.id, c.name, c.slug, c.status, c.custom_domain,
    s.logo_url, s.favicon_url, s.primary_color, s.secondary_color,
    s.accent_color, s.font, s.letterhead_url, s.signature_url,
    s.email_sender_name, s.default_currency, s.default_timezone,
    c.academic_system,
    p.name, coalesce(p.feature_flags, '{}'::jsonb), p.student_limit, p.campus_limit, p.staff_limit, p.ai_message_limit
  FROM chosen c
  LEFT JOIN public.tenant_settings s ON s.tenant_id = c.id
  LEFT JOIN public.plan_tiers p ON p.id = c.plan_tier_id;
$function$;