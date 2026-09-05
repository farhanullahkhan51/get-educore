# EduCore 

Build a professional, enterprise-grade School/College Management ERP called "EduCore" using Supabase as the backend (Auth, Postgres with Row-Level Security, Storage, Edge Functions).

DESIGN DIRECTION:

Institutional, high-trust, premium academic aesthetic (like a top tier/ivy league university's internal admin system) — navy/charcoal and white palette, clean sans-serif typography, generous whitespace, no playful gradients or cartoonish elements. Dashboard-first: every role sees relevant KPIs immediately on login, not a bare menu.

USER ROLES (use Supabase Auth + a `profiles` table with a `role` and `campus_id` column, enforced via RLS):

1. Super Admin / Principal — full access across all campuses

2. Campus Admin — full access scoped to one campus

3. Admissions Officer — inquiries & registration only

4. Accounts/Finance Officer — fee, scholarships, ledger, bank reconciliation

5. Teacher/Staff — only their assigned sections/courses: attendance, grading, assignments

6. Student — own portal only: attendance %, fees, results, assignments, deadlines, certificates

CORE DATA MODEL (create these Postgres tables with proper foreign keys and RLS policies scoped by campus_id/user_id/role):

campuses (with an `academic_system` field: board / cambridge / both), profiles, inquiries, students (with an `academic_system` field for `both`-type campuses), staff, programs, courses, classes, sections, enrollments, board_registrations, board_exam_results, cambridge_registrations, cambridge_subject_entries, fee_structures, fee_challans, bank_accounts, bank_transactions, scholarships, attendance_records, assessments, results, certificates, ledger_entries, notifications, audit_logs.

BUILD IN THIS ORDER:

PHASE 1 — Foundation:

- Supabase Auth with role-based login and role-based redirect to the correct dashboard

- Campuses CRUD, including an "Academic System" setting per campus with three options: **Board** (Matriculation/Intermediate), **Cambridge** (O-Level/A-Level), or **Both**. This flag controls which curriculum/exam setup screens appear later for that campus

- Programs, Classes/Sections CRUD (Admin only) — for `Both`-type campuses, allow each class/section to be tagged with which academic system it follows

- Student and Staff profile CRUD with document upload to Supabase Storage

PHASE 2 — Admissions & Registration:

- Public-facing inquiry form (name, contact, program interest, source)

- Inquiries pipeline board (Kanban-style: New → Contacted → Test Scheduled → Shortlisted → Admitted → Rejected) with drag-and-drop status changes

- One-click conversion from Inquiry to full Registration, auto-generating a unique Student ID and portal login

PHASE 3 — Fee Management:

- Fee structure builder per campus/program (configurable fee heads: tuition, admission, exam, transport, misc)

- Auto-generate monthly/term challans per enrolled student with due dates

- Bank reconciliation screen: upload a CSV bank statement, auto-match transactions to challans by reference number, mark challans paid, flag unmatched transactions for manual review

- Defaulter list with configurable escalation (reminder notification → portal restriction) 

- Scholarship application + approval workflow that automatically recalculates the student's next challan amount

PHASE 4 — Academics:

- Course/subject catalog per program, assign teachers to course-sections

- Attendance marking screen for teachers (grid view per section, per date, single tap present/absent/late)

- Auto-calculated attendance percentage per student, visible on their portal and flagged if below 75%

- Gradebook: teachers enter assessment marks per course, system auto-calculates weighted final grade/GPA per configurable grading scale

- Results publishing workflow with optional approval step before students can see them

- Auto-generated PDF result cards

- Curriculum/exam setup screens must respect each campus's Academic System flag from Phase 1: show Board setup only for `board`/`both` campuses, Cambridge setup only for `cambridge`/`both` campuses, and let `both` campuses assign each student/section to the correct system.

- **Local Board Exam module (Pakistani BISE system)** — for `board`/`both` campuses: support Matriculation (Grade 9-10, SSC Part I & Part II) and Intermediate (Grade 11-12, HSSC Part I & Part II) as a distinct exam track alongside the internal Gradebook. For each student track: registered BISE board (e.g. BISE Lahore, BISE Karachi, BISE Rawalpindi, Federal Board — configurable dropdown), board roll number, chosen Group/Program (Matric: Science / Humanities / Computer Science; Intermediate: Pre-Medical / Pre-Engineering / ICS / Commerce / Humanities), and per-subject marks split into theory + practical components where applicable (Physics, Chemistry, Biology, Computer Science). Store Part I and Part II results separately with a combined total, output both a percentage/division (First/Second/Third) and letter-grade/GPA format. Generate roll-number slips and admit cards (gate admit card release on fee clearance, tying into the Fee module). This module logs official board results once announced — it is a tracking/readiness layer, not a grading engine, since actual grading is done externally by BISE.

- **Cambridge Exam module (O-Level/A-Level)** — for `cambridge`/`both` campuses: track each student's Cambridge Candidate Number and the campus's Centre Number, with subjects entered individually per exam session (not a fixed group like Matric) — e.g. a student may sit Physics, Chemistry, Mathematics, Business, and English Language as five separate subjects with independent syllabus codes and exam sessions (May/June or October/November). Support AS-Level and A2-Level as separate stages combining into a full A-Level per subject, with coursework/practical components for applicable subjects. Store results in Cambridge's own grade scale (A*–G for O-Level, A*–E for A-Level), and generate Statement of Entry documents and result slips per session. Like the Board module, this is a registration/results-logging layer, not a grading engine.

- On `both`-type campuses, keep Board-track and Cambridge-track students' academic records, transcripts, and result cards clearly separated (each pulling only from its own module) while still rolling both up into the same campus-level dashboards (overall attendance %, overall pass rate, etc.).

- **Track Switch workflow:** on `both`-type campuses, allow a student's academic track to change mid-way (e.g. Cambridge O-Level → Board Matriculation, or vice versa) via an explicit request-and-approval flow, not a direct field edit. Admin/Registrar initiates a switch request (student, current track, new track, effective date, reason) → Principal/Campus Admin approves. On approval: mark the student's existing board_registrations/cambridge_registrations record as `closed` (never delete it, so already-sat exams/results/certificates stay intact and visible on the student's timeline), create a fresh registration record under the new track, update section/class assignment, and re-evaluate their fee structure for the next challan. Log every switch permanently (student, from/to system, date, reason, approved by) so the student's full academic-system history is always auditable.

PHASE 5 — Certificates & Documents:

- Template-based certificate generator (Character Certificate, Bonafide Certificate, Transcript) that auto-fills student data

- Each issued certificate gets a unique verification code and a public verification lookup page

- Issuance log (who requested/approved/issued, timestamp)

PHASE 6 — Student Portal:

- Dashboard: attendance %, fee status with pay/download-challan actions, latest results, upcoming assignment deadlines

- Assignment upload area per course (file upload to Supabase Storage, deadline countdown, late-submission flag)

- Downloadable certificates and result cards

PHASE 7 — Principal/Admin Overview Dashboard:

- Single-screen KPIs: total enrollment, fee collection % vs outstanding, average attendance, average GPA, pending approvals (scholarships, results, certificates)

- Campus comparison view (side-by-side KPIs across campuses)

- Full report builder: pick entity + filters + fields, export as CSV/PDF

- Complete audit log viewer

PHASE 8 — AI Automation Layer (build as Supabase Edge Functions calling an LLM API):

- Auto-fetch: whenever a Student ID, Staff ID, or Challan number is entered anywhere in the system, auto-populate all related fields instantly (no manual lookup)

- Admission Inquiry Assistant: a chatbot on the public inquiry form answering FAQs (fees, programs, deadlines) and capturing structured lead data

- Fee Defaulter Predictor: flags students likely to miss upcoming payment based on their payment history

- Attendance Anomaly Detector: flags unusual absence patterns for a counselor follow-up list, not just raw percentages

- Auto-Report Narrator: a button on any dashboard/report that generates a plain-English summary on demand

- Result Insight Agent: after results are published, auto-generate a per-class performance summary and an at-risk-student list

NOTIFICATIONS:

Build a notifications system (in-app + email via an email provider integration) triggered automatically on: fee due soon, attendance dropping below threshold, result published, assignment deadline approaching, scholarship status change.

SECURITY REQUIREMENTS:

- Enforce Row-Level Security on every table — students only ever see their own records, teachers only their assigned sections, Campus Admins only their campus, Principal/Super Admin sees everything

- Full audit logging on all create/update/delete actions across sensitive tables (fees, results, certificates)

Build this incrementally phase by phase, confirming each phase works before moving to the next. Prioritize data integrity and correct role-based access above visual polish in early phases.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7d783f62-8334-4de6-be1c-573f30287ad8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
