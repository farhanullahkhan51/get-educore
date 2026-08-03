# Add an "EduCore CEO" role with full platform access

## Goal
A new role, **EduCore CEO**, grantable from Users & Roles, that has the same platform-wide reach as Super Admin: open Platform Admin, select any tenant, and view, edit or delete anything inside it.

## Current state (verified)
- The database role list already contains `educore_ceo` (added in the migration run just before this plan).
- The database's `is_super_admin` check already returns true for both `super_admin` and `educore_ceo`, so every access rule and security function built on it (campus access, fee management, tenant/plan/subscription rules, user deletion) already treats an EduCore CEO as a platform-wide administrator.
- The app's front end does not know about the role yet: it is missing from the role list, the role labels, the sidebar visibility rules, and the Platform Admin entry check — so a user granted the role today would still be bounced to the dashboard.

## What will be built
1. **Role becomes selectable and readable**
   - "EduCore CEO" appears in the grant-role dropdown on Users & Roles and renders as a labelled badge.
   - Ranked at the top of the role priority list, so it shows as the user's primary role.
2. **Full navigation access**
   - Every sidebar module a Super Admin sees is also shown to an EduCore CEO, including Campuses, Users & Roles and Platform Admin.
3. **Platform Admin access**
   - The Platform Admin page admits EduCore CEO users, giving them the existing tenant list with per-tenant branding/settings editing, tenant creation and deletion, plan tiers and subscriptions.
   - Cross-campus/cross-tenant views elsewhere (Executive Overview, Campuses) treat them as platform-level users rather than campus-scoped.
4. **Protection parity**
   - Revoking an EduCore CEO role uses the same two-step confirmation already used for Super Admin.

## Technical notes
- No further database migration is required; the enum value and `is_super_admin` update are already applied and every RLS policy routes through that function.
- Front-end edits: `src/hooks/use-current-user.ts` (role union, priority order, label), `src/routes/_authenticated/users.tsx` (role list, double-confirm rule), `src/components/layout/app-shell.tsx` (add the role to each nav item's allowed roles), `src/routes/_authenticated/platform.tsx`, `src/routes/_authenticated/insights.tsx`, `src/routes/_authenticated/campuses.tsx` (treat the role as platform-level).
- A shared helper for "is a platform-level admin" will be added to the current-user hook so the checks stay consistent instead of repeating role literals.

## Out of scope
- No change to what Platform Admin can already do per tenant; the CEO role reuses the existing screens.
