# System Health Check: Correct Figures, Safe Access, Support Model

## Your question first: overview vs entering a tenant's system

For fixing bugs, you don't need to enter a client's workspace — you fix the code once here and every institution gets the fix. But for *support* ("my fees total looks wrong"), looking at their actual data is usually the only way to answer quickly. So: build the **overview and read-only support view**, skip full impersonation for now. You get every institution's plan, usage and key numbers at a glance, and can open a read-only view of their data when someone reports a problem. Making changes on their behalf stays off until you actually need it.

## What the audit found

### 1. Numbers that under-report (real bug, affects trust)

- The dashboard fetches raw rows and counts them in the browser. The database returns at most 1,000 rows per request, so any institution past that size silently shows **too few students, too little fee collection, wrong attendance %, wrong outstanding dues**. Plan-limit usage ("Students 900/1000") is wrong for the same reason.
- The Fees page KPI cards (Total Billed / Collected / Outstanding / Defaulters) are computed from only the most recent 500 challans, so those totals are wrong for any busy campus.
- Bank transactions and a few other lists are capped at 500/200 rows with no "showing first N" notice.
- Dashboard money figures print bare numbers with **no currency symbol** — the Fees page correctly shows PKR, the dashboard doesn't.

Fix: use true database counts and sums (server-side aggregation) for every KPI instead of counting fetched rows; show currency using the institution's configured currency; add "showing first N of M" where a list is deliberately capped.

### 2. Cross-institution access holes (security, must fix)

- **Certificates** and **classroom seating** access rules check campus/role but never check which institution the user belongs to. A super admin of School A can read, issue or revoke School B's certificates and change School B's seating.
- The underlying `is_super_admin` check treats an institution's own super admin the same as you (the platform owner). That's the root cause of the two above and any similar policy.
- Students, staff and admissions pages request whole tables and filter in the browser; safe only because of database rules, but wasteful and fragile.

Fix: add an institution check to every affected access rule, and split "platform owner" from "institution super admin" everywhere the two are still conflated.

### 3. Keys and endpoints (checked — clean)

- No API keys, secrets or service keys are present in the app code; secrets are read only on the server.
- The AI chat and voice endpoints require a signed-in user; the billing reminder endpoint requires a shared secret. All good.
- Remaining scanner warnings are the generic "this helper function is callable" notices, which are expected for how the access rules are built.

## Plan of work

1. **Security fixes (first)** — migration adding institution scoping to certificates and seating rules; separate platform-owner from institution super admin in the remaining rules; re-run the scan to confirm clean.
2. **Correct the figures** — replace row-counting with real database counts/sums on the dashboard, fees KPIs and plan-usage meters; add currency formatting; add "showing first N" labels on capped lists.
3. **Sweep the remaining modules** — verify results/GPA, attendance %, admissions conversion and academics percentages against real data with an empty-data case, so nothing shows a blank or a wrong 0%.
4. **CEO overview** — a platform page listing every institution with plan tier, subscription status, trial/renewal date, campuses, students, staff and AI usage, plus a read-only drill-down into one institution's key numbers for support.

## Technical notes

- KPI aggregation moves to database-side counts (`count: 'exact', head: true`) and SQL sum/aggregate functions exposed as security-definer functions scoped by tenant, called from the dashboard/fees pages.
- Currency comes from `tenant_settings.default_currency` through the existing tenant context, not a hardcoded PKR.
- Access-rule changes go through one migration touching `certificates`, `section_seats`, and the policies relying on `is_super_admin`, keeping `is_platform_owner` as the only platform-wide bypass.
- The CEO overview is a new tab in the existing Platform Admin page, gated on `is_platform_owner(auth.uid())`, reading through a tenant-summary function rather than pulling raw rows.
