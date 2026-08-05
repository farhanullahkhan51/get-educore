# Interactive Classroom Seating

Turn each section into a visual classroom: a board, a teacher's desk, and a grid of chairs matching the section capacity. Staff and students are dragged onto seats, and the layout is saved.

## What the user sees

- In Classes & Sections, each section row gets a "Seating" action that opens a full-width classroom view.
- Classroom view (top to bottom): whiteboard strip, teacher's desk, then rows of chairs (auto-arranged from capacity, e.g. 35 seats -> 6 columns x 6 rows with the last row partial).
- Left/side panel lists unseated students of that class/section plus a teacher picker.
- Drag a student card onto an empty chair to seat them; drag between chairs to swap; drag off the chair (or click the seat's remove control) to unseat.
- Drag a staff member onto the teacher's desk to assign the class teacher.
- Occupied chairs show initials + name; hovering shows student ID and guardian.
- Buttons: Auto-fill seats (alphabetical), Clear seating, and a live "28 / 35 seated" counter.
- Touch/mobile fallback: tap a student, then tap a seat (drag-and-drop is unreliable on small screens).

## Data

New table `section_seats` (tenant + campus scoped, one row per occupied seat):
- `section_id`, `seat_index` (0-based position in the grid), `student_id`
- unique on (section_id, seat_index) and on (section_id, student_id)
- `tenant_id`, `campus_id`, timestamps + updated_at trigger

New nullable column `sections.class_teacher_id` referencing `staff` for the teacher's desk.

Access rules: anyone who can already see the section's campus can read seating; campus admins/super admins (and the section's teachers) can seat, move, and unseat. GRANTs to `authenticated` and `service_role`; no anon access.

Seating a student also keeps `students.section_id` in sync, so rosters, attendance, and gradebook continue to work from the existing field.

## Technical notes

- New component `src/components/classroom/seating-chart.tsx`, opened from a dialog in `src/routes/_authenticated/classes.tsx`; the existing expandable roster stays as-is.
- Drag and drop uses native HTML5 drag events (no new dependency) with the tap-to-place fallback.
- Seat writes go through Supabase upsert/delete with optimistic React Query updates and invalidation of `sections`, `class-students`, and a new `section-seats` key.
- Grid columns derived from capacity (`ceil(sqrt(capacity))` clamped to 4-8) so it stays readable; capacity edits reflow the room and warn if seated students exceed the new capacity.

## Build order

1. Migration: `section_seats` table, grants, RLS, `sections.class_teacher_id`.
2. Seating chart component with drag/drop, teacher desk, and seat states.
3. Wire the dialog into Classes & Sections, sync `students.section_id`, add auto-fill/clear.
