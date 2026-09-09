# Students list appears empty — cause found

## What is actually happening

The student records are all there: 158 students, all active, all belonging to your institution and campus, and the page does successfully load them from the database.

The list is empty because the Students page still has a saved view setting of **"Inactive students only"** (chosen at some point from the Layout menu). Since every student is active, that view matches nobody — so the table shows nothing.

Worse, the page hides its own explanation: the "No students yet" message only appears when the search finds nothing, so with a view filter applied you get a completely blank table with no header, no message, and no hint that a filter is on.

## The fix

1. **Show why the table is empty.** When a view filter hides every row, the table says so plainly — "No students match the current view (Inactive students)" — with a one-click "Show all students" button that clears it.
2. **Make the active view visible.** When any filter other than "All" is on, a small removable chip sits next to the search box, so a saved setting can never be invisible again.
3. **Reset your saved setting now** so the Students page opens on all students immediately, without you having to hunt for the menu.
4. **Same treatment on Staff and Classes**, which use the identical view machinery and can go blank the same way.

Nothing about the student records themselves changes — no data is added, removed, or edited.

## Technical details

- Cause confirmed: `ui_preferences` row for module `students` (this user) holds `filter: "inactive"`; `useArranged` applies it after `filtered`, and the empty-state row in `src/routes/_authenticated/students.tsx` is gated on `filtered.length === 0`, so an all-filtered-out result renders zero rows silently.
- Change the empty-state condition to count rows across the arranged `groups`, and distinguish three cases: no records at all, no search match, no view match (with a reset action calling the layout setter with `filter: "all"`).
- Add an active-filter chip driven by `layout.filter`, rendered next to the search input; clearing it writes `filter: "all"` through `useModuleLayout`.
- Apply the same empty-state and chip in `src/routes/_authenticated/staff.tsx` and the roster list in `src/routes/_authenticated/classes.tsx`.
- One-off data correction: set the stored `students` preference for the affected user back to `filter: "all"`.
