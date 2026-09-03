# Next Phase Plan: Security, White-Label, and Communications

## Goal
Close the remaining security and white-label gaps so the platform is safe and sellable as a fully branded SaaS, then add a Communications module that lets institutions message parents/guardians.

## Phase 1 — Security & billing hardening

1. Remediate the 20 remaining Supabase security-linter warnings.
   - 2 public SECURITY DEFINER functions (`resolve_tenant_by_host`, `slug_available`) are intentionally public; document them and keep them narrow.
   - 18 authenticated helpers need review. Where a function is only used by RLS policies/triggers, revoke EXECUTE from `authenticated` and rely on `service_role` or internal policy invocation.
   - Ensure no helper exposes more data than the policy calling it needs.

2. Strengthen expired/suspended tenant protection.
   - Audit every write path for `tenant_is_writable` coverage.
   - Block destructive operations (delete tenant, delete subscription, mass-delete campus data) when a tenant is in read-only state.
   - Make the global read-only shield block create/update/delete on the client before the server rejects it.

3. Fix billing email delivery.
   - Verify or replace the `BILLING_FROM_EMAIL` domain in Resend (current `educore.com` is unverified → 403).
   - Add a Platform Admin UI field for tenant-level sender name/email.
   - Add a test endpoint to send a single trial reminder to a chosen email for verification.

4. Enforce plan limits and feature flags.
   - Add server-side limit checks before creating students, campuses, staff, and AI messages.
   - Hide/grey-out UI actions when a limit is reached.
   - Gate sidebar routes and module tabs using the existing `useEntitlements` hook.

## Phase 2 — Complete white-label experience

1. Tenant-specific public pages.
   - Make `/` and `/pricing` render tenant name, logo, colors, and copy based on the resolved hostname.
   - Add tenant-specific `head()` metadata (title, description, OG, twitter) on `/`, `/pricing`, `/inquire`, and `/signup`.

2. SEO infrastructure.
   - Generate `/sitemap.xml` and `/robots.txt` routes that list tenant public pages and respect the tenant slug/custom domain.
   - Add canonical tags to every public route using the resolved public origin.

3. Custom domain verification and routing.
   - Add a DNS-check server function that verifies `CNAME`/`A` records for `custom_domain`.
   - Show DNS instructions in Platform Admin and the tenant billing/settings area.
   - Store `custom_domain_status` as `pending/verified/failed` and refresh it on demand.
   - Ensure `resolve_tenant_by_host` treats a verified custom domain as the primary match.

4. White-label trust signals.
   - Replace remaining hard-coded "EduCore" strings in public page copy and emails with the tenant brand name.
   - Use tenant letterhead/signature in certificates and fee receipts where configured.

## Phase 3 — Communications module

1. Schema.
   - `guardians`: id, tenant_id, student_id, name, relation, phone, email, is_primary, notification_prefs.
   - `message_templates`: id, tenant_id, name, subject, body (with placeholders), channel (`email`/`sms`/`both`).
   - `messages`: id, tenant_id, campus_id, sender_id, recipient_guardian_id, student_id, channel, subject, body, status, sent_at, provider_response.
   - `message_batches`: id, tenant_id, template_id, channel, filters, total_count, sent_count, failed_count, created_at.

2. Sending.
   - Email via the existing Resend gateway.
   - SMS via a configurable provider (Twilio or a Pakistani gateway such as SMS Gateway Pakistan/Mobilink); start with a pluggable provider interface so the first provider can be added without rewrites.
   - Support placeholders: `{{student_name}}`, `{{guardian_name}}`, `{{class}}`, `{{section}}`, `{{fee_due}}`, `{{institution_name}}`.

3. UI.
   - New `/communications` route under `_authenticated` with tabs:
     - **Compose** — pick template or freeform, choose recipients by class/section/individual guardian, preview, send.
     - **Templates** — CRUD for message templates.
     - **History** — list of sent messages/batches with status and provider response.
     - **Guardians** — manage guardian contacts linked to students.
   - Add a "Message guardians" action to the students list and fee-challan list.

4. Permissions.
   - Super admin, campus admin, and admissions/finance officers can send based on campus access.
   - Teachers can send only to guardians of students in their assigned sections.

## Technical notes

- All schema changes go through Supabase migrations with RLS and GRANTs.
- Server functions use `requireSupabaseAuth` and check campus/tenant access before writes.
- Communications features are gated by plan entitlement `communications` (to be added to `FEATURES`).
- Keep the existing navy/charcoal/white design system; no new color palettes.
- Reuse the existing `PageHeader`, `Card`, `Tabs`, `Table`, and `Dialog` components.

## Suggested build order

1. Security cleanup migration + limit enforcement.
2. Billing email domain fix + test flow.
3. White-label public pages and SEO routes.
4. Custom domain verification.
5. Communications schema + UI.
6. Communications sending + templates + history.
