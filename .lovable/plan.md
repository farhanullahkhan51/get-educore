# Restore student rosters and make full-class seating complete

## What is actually happening

The student records are all there: 158 students, all active, all belonging to your institution and campus, and the page does successfully load them from the database.

The list is empty because the Students page still has a saved view setting of **"Inactive students only"** (chosen at some point from the Layout menu). Since every student is active, that view matches nobody — so the table shows nothing.

Worse, the page hides its own explanation: the "No students yet" message only appears when the search finds nothing, so with a view filter applied you get a completely blank table with no header, no message, and no hint that a filter is on.

## The fix

1. **Show why the table is empty.** When a view filter hides every row, the table says so plainly — "No students match the current view (Inactive students)" — with a one-click "Show all students" button that clears it.
2. **Make the active view visible.** When any filter other than "All" is on, a small removable chip sits next to the search box, so a saved setting can never be invisible again.
3. **Reset your saved setting now** so the Students page opens on all students immediately, without you having to hunt for the menu.
4. **Same treatment on Staff and Classes**, which use the identical view machinery and can go blank the same way.

## Seating issue — cause confirmed

The section roster and the chair assignments are separate today. A section can therefore be full at **30 students of 30 capacity** while only some students have actually been assigned chairs. The live records confirm this: one full Grade 2 section has 9 of its 30 students seated, another has 3 of 30, and two have none seated. The students have not disappeared; their chair assignments were never completed.

The current seating sidebar makes this more confusing because it includes students from every section of the same class in one "Unseated" list, rather than clearly separating the selected section's own roster from students in other sections.

## Seating fix

1. **Always show the selected section's complete roster.** Split the sidebar into "This section — unseated" and an optional "Other sections" area. Every student assigned to the selected section remains visible until given a chair.
2. **Make the counts unambiguous.** Show all three facts together: `30 students assigned · 9 seated · 21 need chairs`. Never describe a section as fully seated merely because its roster has reached capacity.
3. **Complete seating in one action.** Auto-fill assigns every unseated student belonging to this section to the remaining chairs. For a 30-of-30 section, this produces 30 occupied chairs when enough valid chairs exist.
4. **Show a blocking exception instead of hiding anyone.** If all assigned students cannot fit because the roster exceeds chair capacity, display every unseated student plus the exact shortage and retain the existing safe choices to enlarge the room or move selected students to a sibling section of the same class.
5. **Keep cross-section moves deliberate.** Students from other sections remain available only in a separate move area; they are never mixed into this section's auto-fill queue.
6. **Verify every populated section.** Compare assigned, seated and unseated totals so `assigned = seated + unseated`; confirm every chair belongs to the selected section and no student occupies more than one chair.

## Full sections stop accepting students

1. Wherever a section is chosen — registering a student, editing one, bulk import, moving overflow and seating — a section already at capacity shows as **"Full (30 of 30)"** and cannot be picked.
2. The message states the two ways forward: create another section for the same grade, or increase this section's chairs so everyone fits. Both actions are offered right there.
3. The database already refuses to overfill a section; the screen now says so before the attempt instead of after a failed save.

Nothing about the student records themselves changes — no data is added, removed, or edited.


## Technical details

- Cause confirmed: `ui_preferences` row for module `students` (this user) holds `filter: "inactive"`; `useArranged` applies it after `filtered`, and the empty-state row in `src/routes/_authenticated/students.tsx` is gated on `filtered.length === 0`, so an all-filtered-out result renders zero rows silently.
- Change the empty-state condition to count rows across the arranged `groups`, and distinguish three cases: no records at all, no search match, no view match (with a reset action calling the layout setter with `filter: "all"`).
- Add an active-filter chip driven by `layout.filter`, rendered next to the search input; clearing it writes `filter: "all"` through `useModuleLayout`.
- Apply the same empty-state and chip in `src/routes/_authenticated/staff.tsx` and the roster list in `src/routes/_authenticated/classes.tsx`.
- One-off data correction: set the stored `students` preference for the affected user back to `filter: "all"`.
- In `src/components/classroom/seating-chart.tsx`, derive `sectionRoster`, `sectionUnseated`, and `otherSectionStudents` separately. Auto-fill must consume only `sectionUnseated`; the primary unseated list renders all of it without slicing.
- Keep overflow as `max(0, assigned - capacity)`, but do not use overflow to limit which unseated students are visible. Preserve same-class/campus/track checks and the one-student-one-chair database guard.
- Validate the current live baseline after implementation: Grade 2 Blue is 30 assigned / 9 seated, Green is 30 / 3, Red and Yellow are 30 / 0; after auto-fill each should reach 30 / 30 independently without moving academic records.
- Shared helper for per-section active roster counts and free places, consumed by the section pickers in `students.tsx`, `import-export.tsx`, `classes.tsx` and the seating overflow move list; full options render disabled with used/capacity labels.
- Bulk import rejects rows targeting a full section with a per-row reason rather than a generic failure.
