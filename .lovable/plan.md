# Next issue: plan limits are not actually enforced

All security findings are now cleared. The next real gap is billing enforcement: an institution on a small plan can exceed the student, staff and campus allowances included in what they pay for.

## What's wrong today

- The allowance check happens only in the browser, in the "add student", "add staff" and "add campus" forms. Anything that adds records another way — bulk import, the AI assistant, or a direct request to the backend — skips the check entirely.
- The check compares against the list of records currently loaded on screen, not the true total in the institution's records. Once an institution grows past the page's loading cap, the count it compares against is too low and the allowance stops biting.
- Nothing stops an institution whose trial expired from continuing to grow if a record path misses the read-only rule.

## What to build

1. Count from the source of truth
   - Replace on-screen list length with an exact stored count of students, staff and campuses for the institution.
   - Show that same count in the dashboard "plan usage" strip so the numbers on screen match what is enforced.

2. Enforce in the backend, not just the form
   - Add a rule inside the records system that rejects a new student, staff member or campus when the institution is already at its plan allowance, with a clear message naming the plan and the limit.
   - This covers every path at once: forms, bulk import, the assistant, and anything added later.

3. Make the app respond gracefully
   - Disable the "New student / New staff / New campus" buttons with a short "plan limit reached" note when the institution is at its allowance.
   - Show an "Upgrade plan" link next to that note, pointing at the billing page.
   - Bulk import reports how many rows were skipped because of the allowance instead of failing silently.

4. Close the read-only gap
   - Confirm every add/edit/delete path for institution records is covered by the expired-subscription rule, and add the missing ones.

## Technical notes

- Enforcement lands as a database trigger per limited table (`students`, `staff`, `campuses`) that reads the institution's plan allowance through the existing plan/subscription tables and raises a friendly error; grants and access rules are untouched.
- Counts come from an aggregate query rather than fetching rows, so accuracy does not depend on page size.
- The existing `useEntitlements` hook stays the source for the UI state; it starts reading real counts instead of loaded-array lengths.
- Reuse the existing `limitMessage` copy so the browser and backend messages match.

## After this

With billing enforcement solid, the queue is: data-accuracy pass on the dashboard and fee figures (exact totals instead of capped fetches), then the Communications module (guardians, templates, email/SMS sending, history).
