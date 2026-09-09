# Seating drag-and-drop reliability fix

## Goal
Make chair assignment feel immediate and eliminate the remaining seating inconsistency.

## Changes
- Replace repeated live page scanning during every pointer movement with cached chair and teacher-desk positions.
- Update the seating display immediately when a student is moved, swapped, or removed; roll back automatically if saving fails.
- Keep the dragged student visible until the change is confirmed, prevent overlapping drag requests, and clearly show valid and invalid targets.
- Remove the competing browser drag handlers and use one mouse/touch interaction path.
- Correct the student list so each classroom only offers students assigned to that class, while still allowing moves between its sections.
- Harden the seating transaction against simultaneous moves and preserve one chair per student with matching class and section records.

## Verification
- Test unseated-to-chair, chair-to-empty-chair, chair-to-occupied-chair swap, chair-to-unseated removal, rapid repeated moves, and touch-style dragging.
- Recheck the database for duplicate chairs, invalid chair numbers, and seat/class/section mismatches.
- Confirm the classes page remains usable at desktop and mobile widths.

## Technical details
- Use TanStack Query cache snapshots for optimistic updates and rollback.
- Cache drop-target rectangles at drag start and refresh them only after auto-scroll.
- Lock the affected section and student rows inside the seating function before changing records.
