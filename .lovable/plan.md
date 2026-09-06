# What's next: accurate figures, then Communications

Plan limits are now enforced properly (exact counts, backend rules, upgrade notices). Two things follow.

## Part 1 — Make every figure exact

Today the dashboard adds up numbers by pulling the underlying records into the browser and counting them. The records system returns at most 1,000 rows per request, so once an institution passes that size the dashboard, fee totals and admissions figures quietly start under-reporting. With 158 students nothing is wrong yet; it will be wrong silently later.

What to change:

- Dashboard headline figures (students, staff, fees collected/outstanding, attendance rate, inquiries) come from totals calculated in the records system itself, not from a page of loaded rows.
- Fees page totals (billed, collected, outstanding, overdue) use the same exact totals, per campus.
- Charts that need per-month breakdowns get grouped totals rather than raw rows.
- Anywhere a list is intentionally capped (e.g. "latest 50"), label it as a recent list so it never reads as a total.

## Part 2 — Communications module

A new **Communications** page for messaging parents and guardians.

- **Guardians** — contacts linked to each student (name, relation, phone, email, primary contact, preferences), plus a "Message guardians" action on the students and fee-challan lists.
- **Templates** — reusable message texts with placeholders such as student name, class, fee due and institution name.
- **Compose** — pick a template or write freely, choose recipients by class, section or individual, preview the filled-in message, send.
- **History** — every message and batch with delivery status.
- Email sends through the existing email setup; text messages go through a pluggable provider so one can be added later without rework.
- Permissions: admins and finance/admissions staff can message within their campus; teachers only for their own sections. Gated by a `communications` plan feature.

## Technical details

- Exact figures: aggregate queries (count/sum/group-by) exposed as security-definer functions scoped by institution and campus, consumed through new hooks; replaces `select(...)`-then-`length`/`reduce` in `dashboard.tsx`, `insights.tsx` and `fees.tsx`.
- Communications: new tables `guardians`, `message_templates`, `messages`, `message_batches` with GRANTs and RLS, tenant/campus scoped; sending in a server function using `requireSupabaseAuth`; new route `src/routes/_authenticated/communications.tsx` registered in `ui-surfaces.ts`.
- Verification: typecheck, then a live check that dashboard totals match direct counts, and one test send recorded in history.

## Suggested order

1. Exact figures (small, unblocks trust in every screen).
2. Guardians + templates.
3. Compose + sending + history.
