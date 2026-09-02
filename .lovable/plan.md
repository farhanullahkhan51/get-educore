# Plan tiers cleanup + what's still missing in EduCore

## Current state (checked in the database)

There are **four** plan rows, not three: legacy `Starter`, `Pro`, `Enterprise` (created at first setup, all with **empty feature flags**) plus a newer `Professional` row seeded with the full feature list. Two institutions are attached to the legacy `Enterprise` row. Because Starter/Pro/Enterprise have empty flags, they currently unlock **everything** — gating only really works on the `Professional` row.

## 1. Fix the tiers (three only, "Pro" not "Professional")

- Keep the three original rows: **Starter**, **Pro**, **Enterprise** (keeping the IDs means the two live institutions stay linked).
- Copy the seeded feature set from `Professional` into `Pro`, then delete the `Professional` row.
- Fill in proper feature flags and limits for Starter and Enterprise so gating actually applies.
- Set `sort_order` 1 / 2 / 3 so the plan list always shows Starter → Pro → Enterprise.

Proposed limits:

| | Starter | Pro | Enterprise |
|---|---|---|---|
| Campuses | 1 | 3 | unlimited |
| Students | 500 | 2,500 | unlimited |
| Staff | 60 | 300 | unlimited |
| AI messages / month | 0 | 1,000 | 10,000 |

## 2. Features every tier must include (never gate these)

These are the "the product doesn't work without them" items and should stay on in all three plans:

- Students, staff, campuses, classes & sections (with the seating chart)
- Courses, programs and teaching assignments
- Attendance and gradebook, marks-based results
- Fees, challans and receipts (basic)
- Admissions inquiries + public inquiry form
- Certificates (core set of templates)
- Users & roles, audit log, logo-level branding
- Mobile view with pull-to-refresh

Differentiators to keep gated: bank reconciliation, payroll, Cambridge module, track switch, student portal, insights/analytics, AI assistant, full branding, custom domain, edit mode, all certificate templates.

## 3. What's still missing from the system

Ranked by how often Pakistani schools/colleges actually ask for it:

**High value, notable gaps**
1. **Timetable / period scheduling** — no timetable module at all today; teacher clash detection, per-section weekly grid, printable timetable.
2. **Communication** — no SMS/WhatsApp/email to guardians: fee reminders, absence alerts, result published notices.
3. **Parent/guardian portal** — students have a portal, guardians do not (fees due, attendance, results).
4. **Online fee payment** — challans are print-only; no payment link or gateway reconciliation.
5. **Exports & printable reports** — PDF/Excel export for students, fee collection, defaulters, attendance registers.
6. **Bulk import** — CSV import for students, staff, marks and bank statements.

**Medium value**
7. Homework / assignment submission and teacher announcements
8. Library, transport (routes and fees), hostel modules
9. Staff leave & attendance (payroll exists but no leave/attendance link)
10. Expense / petty cash ledger to complete the finance picture
11. Discipline and health records on the student profile
12. Alumni and school-leaving history

**Platform / hygiene upgrades**
13. Self-serve signup + checkout so plans sell themselves (currently you assign plans manually)
14. Notification centre and email templates on tenant branding
15. Data export / backup per institution (a selling point for enterprise buyers)
16. Urdu / RTL language option
17. Security pass on the 31 database linter warnings about publicly executable functions

## 4. Recommendation

Ship in this order: tier cleanup (this plan) → timetable → guardian communication (SMS/email) → exports and bulk import → online fee payment. Those five turn the ERP from "complete records system" into something a principal notices daily, and each maps cleanly onto a Pro/Enterprise upsell.

## Technical notes

- One migration: update `plan_tiers` rows (flags, limits, `sort_order`), delete the `Professional` row, no schema change needed.
- Platform Admin plan editor already renders named feature checkboxes, so no UI change is required beyond the tiers reading correctly.
- Nothing in `useEntitlements` changes; empty-flag plans currently mean "allow all", which stops being a problem once every tier has explicit flags.
