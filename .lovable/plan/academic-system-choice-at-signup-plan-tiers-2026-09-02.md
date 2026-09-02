# Academic-system choice at signup + plan tiers

## Where things stand today

- The academic system (Board / Cambridge / Both) is only chosen per campus, program and course — there is no institution-level choice made when a client buys a plan.
- Plan tiers exist (name, student limit, campus limit, free-form feature flags JSON) and can be attached to an institution, but nothing in the app reads those flags: every module is visible to every institution regardless of plan.

So: no, the system does not currently ask "Board, Cambridge, or both" at purchase, and plans do not gate anything.

## What to build

### 1. Academic system chosen per institution
- Add an institution-level setting: `board`, `cambridge`, or `both`, set when the institution is created in Platform Admin (and editable later).
- New campuses, programs and courses default to that setting; the picker only offers the systems the institution owns.
- Sidebar hides the BISE Board module for Cambridge-only clients, and the Cambridge module for Board-only clients. Results, certificates and track-switch adapt the same way (Track Switch is only meaningful for "both").
- Switching an institution to a narrower system warns instead of deleting: existing data stays, the module is just hidden.

### 2. Plan tiers become real
- Replace the raw JSON box with a checklist of named features plus limits, and enforce them: modules not in the plan are hidden and their routes redirect with an upgrade notice; limits (students, campuses, staff, AI messages) block creation past the cap with a clear message.
- Show the current plan and usage against limits on the Dashboard for admins.

### 3. Suggested tier structure

| | Starter | Professional | Enterprise |
|---|---|---|---|
| Campuses | 1 | up to 3 | unlimited |
| Students | 500 | 2,500 | unlimited |
| Core (students, staff, classes/sections, attendance) | yes | yes | yes |
| Admissions pipeline + public inquiry form | basic | full (Kanban, conversion) | full |
| Fees, challans, scholarships | yes | yes + bank reconciliation | yes + payroll |
| Academics, gradebook, marks results | yes | yes | yes |
| BISE Board module | yes | yes | yes |
| Cambridge module | add-on | yes | yes |
| Track switch (Board <-> Cambridge) | no | yes | yes |
| Certificates & documents | 3 templates | all templates | all + custom template |
| Student portal | no | yes | yes |
| Principal insights / analytics | no | yes | yes + exports |
| AI assistant | no | limited monthly messages | high cap, own API key option |
| Branding | logo only | full colours, fonts, letterhead | full + custom domain |
| Edit-mode layout customisation | no | yes | yes |
| Support | email | priority | dedicated + onboarding |

Add-ons sellable on any tier: Cambridge module, extra campus, extra AI message pack, custom domain.

## Technical notes

- Migration: `academic_system` column on `tenants` (enum, default `both`); structured columns or a typed JSON shape on `plan_tiers` for feature keys plus `staff_limit` and `ai_message_limit`; seed the three tiers above.
- A `useEntitlements()` hook reads the current tenant's plan tier + academic system from `TenantProvider`, exposing `can(feature)` and `limit(key)`.
- Gating happens in three places: sidebar/module list, route guards, and create/insert handlers for limit checks. Server-side limit checks live in the relevant server functions so gating is not client-only.
- AI message cap reuses the existing `ai_usage_limits` metering rather than a new counter.

## Scope note

This plan covers institution-level academic system plus plan gating. It does not add self-serve checkout or payment collection; plans are still assigned by you in Platform Admin.
