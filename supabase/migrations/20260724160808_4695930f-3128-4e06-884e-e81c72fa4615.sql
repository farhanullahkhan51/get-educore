
-- Public tenant resolver by hostname: returns minimal tenant + branding
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_host(_host text)
RETURNS TABLE (
  id uuid,
  name text,
  slug text,
  status public.tenant_status,
  custom_domain text,
  logo_url text,
  favicon_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  font text,
  letterhead_url text,
  signature_url text,
  email_sender_name text,
  default_currency text,
  default_timezone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    s.email_sender_name, s.default_currency, s.default_timezone
  FROM chosen c
  LEFT JOIN public.tenant_settings s ON s.tenant_id = c.id;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_host(text) TO anon, authenticated;
