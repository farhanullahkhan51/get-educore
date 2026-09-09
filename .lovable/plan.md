# Fix the seating plan: students sitting in more than one classroom

Yes, there is a real bug, and it is in the stored data, not just on screen.

## What I found in the live records

- **60 students currently occupy a chair in more than one classroom at the same time.**
- **88 chairs hold a student whose own record says they belong to a different section.** So a class roster and its seating chart can disagree about who is in the room.
- No chairs beyond capacity, no chairs holding removed or inactive students, no leftover "in-transit" chairs. Those parts are healthy.

## Why it happens

A chair is only ever checked against the classroom it is being placed in. When a student is seated in a second classroom, or moved to another section from the Students page, the chair they occupied in the old classroom is never freed. Two paths make this worse:

- **Auto-fill** writes chairs directly instead of going through the guarded seating step, so it skips the checks that the drag-and-drop path uses.
- **Clearing or removing** a student from a chair leaves their section unchanged, and changing their section elsewhere leaves the chair unchanged, so the two records drift apart.

## The fix

1. **One student, one chair, platform-wide.** Seating a student anywhere automatically frees any chair they hold in another classroom, and their student record is updated to the new section in the same step. Enforced in the database, so every path obeys it.
2. **Keep chairs and section records in step.** When a student's section is changed anywhere in the system (Students page, bulk import, track switch), any chair they hold in a section they no longer belong to is released automatically.
3. **Route Auto-fill through the same guarded step** as drag-and-drop, so range, campus, track, status and duplicate checks all apply, and partial failures report clearly.
4. **Clean up the existing 88 mismatched chairs.** For each affected student keep the chair in the classroom their student record names; where the record names no section, keep the most recently placed chair and free the rest. No student is deleted or moved between classes — only duplicate chairs are released.
5. **Show the truth in the room.** The counter reads "X of Y seated" from actual chairs, and a short note appears if any student in that class is unseated after cleanup, so staff can place them deliberately.

## Technical notes

- Migration: extend `set_section_seat` to delete the student's rows in other sections before placing them, add a partial unique index style guard on `(student_id)` across `section_seats`, and add a trigger on `students.section_id` changes that clears stale seats.
- Data repair runs in the same migration, reconciling the 88 mismatches with the rule above; the swap path keeps its temporary negative index and is left intact (no stuck rows exist today).
- `src/components/classroom/seating-chart.tsx`: `autoFill` calls the RPC per student instead of a raw insert; error toasts summarise skipped students.
- No visual redesign of the classroom, no schema changes elsewhere.
