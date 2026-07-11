
# EduCore — School/College Management ERP

A multi-campus, multi-role academic ERP with dual-track (Pakistani BISE Board + Cambridge O/A-Level) support, built on Lovable Cloud (Supabase Auth, Postgres + RLS, Storage, Edge Functions) and TanStack Start.

This is a very large scope (~8 phases, ~25 tables, 6 roles, 2 exam systems, AI layer). I'll build it **incrementally, phase by phase**, and stop for your confirmation after each phase before moving on. This plan covers the whole arc; we'll flesh out details as we go.

## Design direction

- Institutional, high-trust: navy + charcoal on white, generous whitespace, no gradients.
- Serif display font for headings (Fraunces/Source Serif) paired with a clean sans (Inter) for UI — evokes ivy-league admin.
- Dashboard-first: every role lands on KPIs relevant to them, never a bare menu.
- Data-dense but calm tables, subtle borders, consistent semantic tokens defined in `src/styles.css`.

## Architecture

- **Auth & data:** Lovable Cloud (Supabase). `profiles` table joined to `auth.users` with `role` + `campus_id`. RLS on every table scoped by role/campus/user.
- **Roles table:** separate `user_roles` table + `has_role()` security-definer function (never store role on `profiles` alone for privileged checks — prevents privilege escalation).
- **Server logic:** TanStack `createServerFn` for app-internal reads/writes; server routes under `src/routes/api/public/*` for webhooks and the public inquiry chatbot endpoint.
- **AI layer (Phase 8):** Supabase Edge Functions (or TanStack server fns) calling Lovable AI Gateway (`google/gemini-3-flash-preview` by default).
- **Storage:** Supabase Storage buckets for `student-docs`, `staff-docs`, `assignments`, `certificates`.
- **Notifications:** in-app table + email via Lovable Emails (Resend). SMS out of scope unless requested.

## Phase order (build & confirm each before the next)

1. **Foundation** — Auth, role-based redirect, `profiles`/`user_roles`/`has_role()`, campuses CRUD (with `academic_system: board | cambridge | both`), programs, classes, sections (system-tagged), student/staff profiles + document upload.
2. **Admissions** — public inquiry form, Kanban pipeline, one-click convert to student (auto Student ID + portal login via Auth Admin).
3. **Fees** — fee structures, auto-challan generation, CSV bank reconciliation, defaulter list, scholarship workflow.
4. **Academics** — courses, teacher assignment, attendance grid, gradebook + GPA, results publishing, PDF result cards, **BISE Board module** (Matric/Inter, groups, theory+practical, roll slips, admit cards gated on fees), **Cambridge module** (O/A-Level, candidate/centre numbers, per-subject session entries, A*-G / A*-E grades, Statement of Entry), **Track Switch** request/approval workflow preserving history.
5. **Certificates** — templated PDF generator, unique verification code + public lookup page, issuance log.
6. **Student portal** — dashboard (attendance %, fees, results, deadlines), assignment upload, downloads.
7. **Principal/Admin overview** — KPI dashboard, campus comparison, report builder (CSV/PDF export), audit-log viewer.
8. **AI layer** — auto-fetch on ID entry, inquiry chatbot, fee-defaulter predictor, attendance-anomaly detector, report narrator, result-insight agent.

Notifications and audit logging are threaded through every phase from Phase 3 onward (schemas seeded in Phase 1).

## What I need from you before starting Phase 1

A few decisions that will shape the schema and are cheaper to lock in now than to refactor later:

1. **Grading scale for the internal Gradebook (Phase 4).** Default I'll use unless you say otherwise: A+ ≥ 90, A 85, A− 80, B+ 75, B 70, C 60, D 50, F <50, with GPA on a 4.0 scale. OK, or give me your scale?
2. **Currency & fee cycle default.** I'll assume PKR and monthly challans with configurable term/annual overrides. Confirm?
3. **Email provider.** Lovable Emails (built-in, no setup) vs. bring-your-own (Resend/Brevo/Mailgun via connector). Recommend Lovable Emails to start.
4. **Public inquiry chatbot LLM.** Default: Lovable AI Gateway with `google/gemini-3-flash-preview`. OK?

Once you confirm (or say "use defaults"), I'll enable Lovable Cloud and start Phase 1: auth, roles, campuses, programs/classes/sections, and student/staff profiles with document upload. I'll stop at the end of Phase 1 for you to test before moving on.
