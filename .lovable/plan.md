# EduCore CEO: Tenant Oversight and Support Access

Yes, this is doable — and most of the foundation is already there. Your account already holds the platform-owner role (`educore_ceo`), and platform-wide policies grant it access across every institution. What's missing is the console: today the Platform Admin tenant preview only swaps branding (logo/colors/font), it does not put you inside a tenant's actual data.

## What you'll get

1. **Tenant overview** — one place listing every institution with plan tier, subscription status, trial/renewal dates, campuses, students, staff, AI usage and last activity.
2. **Tenant detail view** — open any institution to see its plan, billing history, invoices, payment proofs, campuses, admin users and limits versus current usage.
3. **Support mode** — a single "Enter support session" button that switches your session into that institution's workspace, so every module (Students, Fees, Academics, Timetable, Certificates) shows their data exactly as their admin sees it.
4. **Safety rails** — support mode starts read-only. To make changes you flip an explicit "Allow edits" switch, and the session is recorded.
5. **Persistent banner** — while in support mode a bar stays at the top of every page showing which institution you're inside, whether edits are allowed, and an "Exit support session" button.
6. **Audit trail** — every support session (who, which tenant, when, read-only or edit, what was changed) is logged and visible in Platform Admin.

## Technical approach

- **Support session state**: extend `src/lib/tenant-context.tsx` from branding-only `preview` to a full `supportSession` ({ tenantId, name, canWrite }), persisted in storage and exposed through `useTenant()`.
- **Data scoping**: today module queries rely on RLS to scope rows. In a support session, queries filter by the selected tenant's `tenant_id`/campus set. Add a small `useActiveTenantId()` helper and thread it through the module list queries (students, staff, classes, fees, academics, timetable, certificates) so the CEO sees exactly that tenant's rows and nothing merged across institutions.
- **Write guard**: reuse `read-only-shield.tsx` — when a support session is read-only, block create/update/delete in the UI. Server-side, add a `support_sessions` check so writes made during a session are attributed to the CEO, not the tenant admin.
- **New table `support_sessions`**: tenant_id, actor_id, started_at, ended_at, write_enabled, reason. RLS: only platform owner can read/insert; service_role full. Plus GRANTs.
- **Audit link**: reuse `insertAuditLog` in `src/lib/audit.functions.ts`, tagging entries with the active support session id.
- **Platform Admin UI**: new "Tenant" detail panel and a support-session tab inside `src/routes/_authenticated/platform.tsx`, using existing PageHeader/Card/Table/Dialog components and the navy/charcoal/white system.
- **Access control**: everything gated on `is_platform_owner(auth.uid())` — institution super admins never see these controls.

## Build order

1. `support_sessions` table + RLS/GRANTs migration.
2. Support session state in tenant context + top banner + exit control.
3. Tenant overview and detail panels in Platform Admin.
4. Query scoping across modules, read-only by default.
5. Session audit log view.
