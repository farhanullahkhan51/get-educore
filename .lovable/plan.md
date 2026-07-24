# Multi-tenant conversion — Step 1 only

Scope of this plan is exactly Step 1 from your list: introduce the tenancy tables, seed plan tiers, and create the default tenant + its tenant_settings row. No existing tables are touched, no RLS is changed, no UI is added yet. Steps 2–8 will each get their own plan once Step 1 is verified.

## What gets created (single migration)

1. `plan_tiers`
   - `name` (unique), `feature_flags jsonb default '{}'::jsonb`, `student_limit int`, `campus_limit int`
   - Seeded: **Starter / Pro / Enterprise** with escalating limits and empty feature_flags you can fill later.

2. `tenants`
   - `name`, `slug` (unique, lowercase, url-safe), `custom_domain` (nullable, unique when set), `custom_domain_status` (enum: `pending | verifying | verified | active | failed`, default `pending`), `domain_verification_token` (random text, generated on insert), `plan_tier_id` (fk plan_tiers), `status` (enum: `active | suspended | trial`, default `active`).

3. `tenant_settings` (1-to-1 with tenants; pk = tenant_id)
   - `logo_url`, `favicon_url`, `primary_color`, `secondary_color`, `accent_color`, `font`, `letterhead_url`, `signature_url`, `email_sender_name`, `default_currency` (default `PKR`), `default_timezone` (default `Asia/Karachi`).

4. `subscriptions`
   - `tenant_id` (fk), `plan_tier_id` (fk), `billing_cycle` (enum: `monthly | yearly`), `status` (enum: `active | past_due | canceled | trialing`), `current_period_end timestamptz`.

All four get `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at` + update trigger, GRANTs, RLS enabled.

## Row-Level Security for these new tables (Step 1 only)

Step 1 has no tenant_id column on existing tables yet, so policies here are minimal and safe:
- `plan_tiers`: `SELECT` for `authenticated` (everyone can see tier metadata); writes restricted to `super_admin` via existing `has_role`.
- `tenants`, `tenant_settings`, `subscriptions`: `SELECT/ALL` restricted to `super_admin` for now. In Step 6 we'll introduce the `platform_super_admin` role and rewrite these; in Step 3 we'll add tenant-scoped read for a tenant's own row.
- `anon` gets no access to any of these tables in Step 1.

## Seed data

- `plan_tiers`: Starter (500 students / 1 campus), Pro (5,000 / 5), Enterprise (unlimited, stored as NULL).
- Default `tenants` row: `name = 'EduCore'`, `slug = 'educore'`, `plan_tier_id = Enterprise`, `status = 'active'`. (Say the word if you want a different name/slug — easy one-line change before I run the migration.)
- Default `tenant_settings` row referencing that tenant, all branding fields left NULL — you'll fill them in after Step 1 as you noted.

## Explicitly NOT in this step

- No `tenant_id` column added to existing tables (that's Step 2).
- No changes to existing RLS policies (Step 3).
- No hostname resolution, theme context, or UI (Steps 4–7).
- No Platform Super Admin role or console (Step 6).
- Nothing removed or renamed.

## Verification before moving to Step 2

After the migration runs I'll query and show you:
- The 3 plan_tiers rows
- The default tenants row (with its generated verification token)
- The default tenant_settings row
- That existing tables/policies/data are untouched (row counts unchanged on `profiles`, `students`, `campuses`).

Once you confirm, I'll produce the Step 2 plan (adding `tenant_id` to every existing table, backfilled to the default tenant id, NOT NULL).
