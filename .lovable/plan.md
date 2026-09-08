# Final data-accuracy and integrity pass

## Goal
Make every important figure consistent with the underlying records, correct the confirmed overdue defect, and prevent the same classes of errors from returning as the institution grows.

## Confirmed issues
- Two challans are genuinely overdue by due date and positive balance, while the dashboard reports zero because it relies on a stored status that is not advanced as time passes.
- Fee totals, defaulter counts, campus figures, finance-table badges, student portal figures, and exam fee-clearance checks do not all use the same balance/status rules.
- Three duplicate attendance groups exist, while attendance saving assumes one record per student/date/course.
- One section currently exceeds its configured capacity.
- Student, staff, class-roster, and admissions screens calculate visible counts from unpaginated browser queries; these silently become incomplete after the backend's row cap.
- The finance challan list stops at 500 rows, so its visible rows can disagree with exact totals.

## Implementation

### 1. Establish one authoritative fee calculation
- Define net billed, paid, remaining balance, effective status, overdue challan, and overdue student once in database functions.
- Treat a challan as overdue only when its due date has passed, it is not waived, and it has a positive balance.
- Sum positive balances per challan so an overpayment can never hide another debt.
- Count defaulters as distinct students with genuinely overdue balances.
- Keep saved fee status synchronized on every relevant insert/update and normalize the two currently stale records.

### 2. Align every fee surface
- Use the corrected database totals for the dashboard and Finance KPIs.
- Show past-due partial challans as overdue as well as unpaid ones.
- Apply the same positive-balance rule in the student portal and Board/Cambridge document-clearance checks.
- Make AI finance summaries use exact database aggregates rather than capped record downloads.
- Invalidate dashboard, finance, and student-facing totals after payments, edits, generation, deletion, and bank matching.

### 3. Remove truncation from totals and operational lists
- Add exact, campus-aware admissions aggregates for New, Active, Converted, and conversion rate.
- Paginate students, staff, inquiries, challans, and bank transactions instead of relying on implicit 1,000-row or explicit 500-row caps.
- Keep search and filters consistent with the full dataset so displayed group counts match browsable records.
- Replace capped AI attendance, admissions, fee, and results summaries with exact aggregate functions.

### 4. Repair and protect attendance integrity
- Safely merge the three confirmed duplicate attendance groups by retaining the latest record in each group.
- Add a database uniqueness rule that matches the app's student/date/course attendance identity, including records without a course.
- Keep attendance saving idempotent and verify dashboard, report-card, and portal rates against the cleaned records.

### 5. Handle section capacity accurately
- Display the existing over-capacity section clearly without deleting or moving any student automatically.
- Prevent future section assignments beyond capacity in both normal forms and bulk/track-switch paths.
- Keep class and section counts exact and show an actionable capacity error.

### 6. Verify all reporting paths
- Compare database truth with Dashboard, Finance, Admissions, Classes, Student Portal, Academics, Results, Board, Cambridge, and AI summaries.
- Test campus-scoped and institution-wide views separately.
- Confirm the known baseline: 2 overdue challans, PKR 56,000 billed, PKR 20,000 collected, and PKR 36,000 outstanding.
- Run type checks, targeted data-integrity queries, authenticated desktop/mobile browser flows, console/network checks, and a security/dependency scan.
- Leave no synthetic test rows behind and document any business-data anomaly that cannot be corrected safely without an administrator choosing the intended record.

## Technical notes
- Existing public function signatures remain stable so current screens do not break.
- All aggregate functions remain tenant- and campus-scoped and executable only by authenticated users with access.
- Existing records are preserved except exact duplicate attendance rows, which are consolidated before the matching uniqueness rule is added.
- No unrelated features or visual redesign are included.
