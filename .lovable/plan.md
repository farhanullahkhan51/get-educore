## Pre-flight: Bug sweep of phases 1–3

Supabase linter reports only pre-existing WARN-level notes on our `SECURITY DEFINER` helpers (`has_role`, `is_super_admin`, `get_user_campus`, `has_campus_access`, `can_manage_fees`, `handle_new_user`, `update_updated_at_column`). These are intentional and required to avoid RLS recursion — safe to leave.

Before starting Phase 4 I will audit and patch:
1. **Dialog a11y warnings** (console): several `DialogContent` blocks are missing `DialogDescription`/`aria-describedby`. Add descriptions across `admissions`, `students`, `staff`, `classes`, `campuses`, `programs`, `fees` edit dialogs.
2. **Session robustness**: verify every mutation uses `supabase.auth.getSession()` guard pattern so the app never bounces to `/auth` on transient errors (already applied in most; sweep `fees.tsx` and `admissions.tsx`).
3. **Fee module sanity**: confirm challan totals recompute correctly when scholarship changes, and that "Record Payment" writes a matching `bank_transactions` row (audit trail). Fix if missing.
4. **Public inquiry**: confirm `campuses` public SELECT works from the anon key on the deployed preview (already fixed, spot-check).
5. **Student "grade" auto-fill** on inquiry conversion: verify the field prefills only when empty (already implemented, spot-check).

No schema changes expected for the sweep unless I find a real bug.

---

## Phase 4 — Academics (large; ship as 4 sub-phases)

Because Phase 4 spans two exam systems + internal gradebook + PDF generation + a track-switch workflow, I will ship it in 4 sub-phases, each independently testable. I will stop for confirmation after each sub-phase.

### 4A. Core Academics
**Tables (new):** `courses`, `course_assignments` (teacher ↔ section ↔ course), `attendance_records`, `assessments`, `assessment_scores`, `grading_scales`, `report_cards`.
**Grading scale default:** A+ ≥90, A ≥85, A− ≥80, B+ ≥75, B ≥70, C ≥60, D ≥50, F <50, GPA on 4.0. Configurable per campus.
**UI:**
- `/courses` (Admin) — CRUD, code auto-gen (subject initials), assign to program/class.
- `/teaching` (Teacher) — landing page listing the teacher's assigned sections/courses. From here they enter attendance and gradebook for a specific section+course.
- **Attendance grid** — one row per enrolled student, one column per date; Present/Absent/Late/Leave; bulk-mark, save, edit. KPI card shows section attendance %.
- **Gradebook** — per (section, course): create Assessments (Quiz/Assignment/Mid/Final, weight, max marks), enter scores in a spreadsheet grid, auto-computed weighted % and letter grade.
- **Results publishing** — Campus Admin locks a term, generates internal Report Cards (subject grades + GPA + attendance %), and publishes to the Student portal.
- **PDF result card** — printable format via a `/print/report-card/:id` route (same 3-copy pattern used for challans).

### 4B. BISE Board module
**Tables:** `board_registrations`, `board_subjects`, `board_exam_entries`, `board_results`.
**UI (under `/board`):**
- Register a student for Matric/Inter, choose Group (Science/Arts/Commerce/Pre-Med/Pre-Eng), select subjects with theory + practical marks split.
- Generate/print **Roll Slips** and **Admit Cards**, gated on the student having no outstanding fee challan for the term (join with `fee_challans`).
- Enter/import board results and store them for certificate generation later.

### 4C. Cambridge module
**Tables:** `cambridge_registrations`, `cambridge_subject_entries`, `cambridge_results`.
**UI (under `/cambridge`):**
- Register a student for O/A-Level with candidate number and centre number.
- Per session (May/June, Oct/Nov) subject entries with syllabus code, tier, and expected grade.
- Generate/print **Statement of Entry**.
- Enter/import per-subject results using the A*–G / A*–E grade scale.

### 4D. Track Switch workflow
**Tables:** `track_switch_requests` (student_id, from_system, to_system, reason, status, requested_by, decided_by, decided_at).
**UI:** Admissions Officer or Campus Admin raises a request; Super Admin/Campus Admin approves; on approval, update `students.academic_system` while preserving all prior board/Cambridge history rows (never delete). Add a "Track History" panel on the student profile.

**RLS rules across 4A–4D:**
- Teachers can read/write attendance and gradebook rows ONLY for sections/courses in their `course_assignments`.
- Students can read their own attendance, results, and report cards.
- Campus Admin scoped to `campus_id`; Super Admin unrestricted.
- Public/anon has no access to any Phase 4 table.
- Every new public-schema table gets explicit `GRANT`s in the same migration.

---

## Deliverables sequence

1. Bug-sweep patches (single small edit batch, no migration).
2. Sub-phase 4A migration → 4A UI → stop for review.
3. Sub-phase 4B migration → 4B UI → stop.
4. Sub-phase 4C migration → 4C UI → stop.
5. Sub-phase 4D migration → 4D UI → stop.

**Confirm this plan and I will start with the bug sweep + Sub-phase 4A (Core Academics) in the next message.**
