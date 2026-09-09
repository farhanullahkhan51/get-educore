# Fix seating: "could not seat students" and the misleading 30/30 counter

## What I confirmed in the live records

- One classroom, **Yellow, holds 42 students but its room size is set to 30**. Two more classrooms (Blue and one Green) are exactly at 30 of 30.
- The seating step refuses to move a student into a classroom that is already at its stated size. That refusal is correct — but the screen only shows a generic "X student(s) could not be seated" and never says why.
- So the message is a real limit being hit, not a broken button. Auto-fill tries to place students who belong to another classroom of the same class, the full-room rule stops them, and the count is reported with no explanation.

## Why "30 / 30 seated" undercounts the class

The counter is counting **chairs that are filled**, not students in the class. A room can never show more than its chair count, so once the room is full it freezes at "30 / 30" even though 42 students are actually assigned to that classroom. The extra 12 are simply invisible in that number. Nothing is lost in the records — every student is still in the class roster — the number on screen just answers a different question than the one staff are asking.

Fix: show both figures side by side — "30 of 30 chairs filled · 42 students assigned" — with a clear over-capacity warning when the roster exceeds the chairs, and list the unseated students so none of them are hidden.


## The fix

1. **Say what actually happened.** Replace the generic failure count with the real reason per student, grouped: "3 students could not be seated — Yellow is already full (30 of 30)", "1 student is on a different track", and so on. Single drag-and-drop failures show the same plain-language reason instead of a database message.
2. **Warn before auto-fill starts**, not after: if the class has more students than chairs, show how many will be left out and which classroom they need to move to.
3. **Show the room's true state in the header**: "42 students assigned, 30 chairs" with a clear over-capacity note and a hint to raise the room size or move students to another section.
4. **Skip pointless attempts.** Students who cannot possibly be placed (full room, wrong campus, wrong track, inactive) are filtered out of auto-fill up front so the run reports only genuine placements.
5. **Give a way out.** From the over-capacity note, offer two direct actions: increase this room's size, or move the extra students to another section of the same class.

## Moving overflow students to another section

- Next to each unseated student, and in a "Move overflow students" action on the over-capacity note, offer the other sections of the same class with their free space shown, for example "Red — 7 seats free", "Green — 5 seats free". Sections with no space are listed but not selectable.
- Selecting students (individually or "select all overflow") and a target section moves them: their class record changes to the new section, any chair they held here is released, and the room count updates at once.
- Moves respect the same rules as seating — a student cannot be moved into a section that is already full, on a different campus, or on a different academic track — and the reason is stated if one is refused.
- After a move, a single confirmation states what happened, for example "12 students moved to Red", with the sending and receiving rooms both refreshed.

## Nothing about a student's studies changes

A move only changes which room of the same class a student sits in. Guaranteed by the design:

- Only sections of the **same class** are offered — never another class, grade, programme, campus, or Board/Cambridge track.
- The student's class, programme, group and academic track stay exactly as they are; only the section changes.
- Courses, teaching assignments, timetable, attendance history, marks, report cards, certificates, fees and challans are all untouched — none of them are rewritten by the move.
- Anything already recorded against the old section (past attendance, past marks) stays as history; only future records follow the new section.
- Every move is written to the activity log so staff can see who moved whom and when.


## Operational note

Yellow needs a decision either way: raise its size above 42, or move 12 students to Red (23 of 30) or the Green section with 25 of 30. The software changes above make that choice obvious instead of hiding it behind a failure count.

## Technical details

- `src/components/classroom/seating-chart.tsx`: `autoFill` collects per-student RPC errors and maps Postgres messages (`Section capacity of % has been reached`, academic-system mismatch, inactive student, campus mismatch) to readable text; `seatStudent` uses the same mapping. Add a pre-flight active-roster-vs-capacity check.
- `seatingError` gains a roster-capacity check mirroring the `enforce_section_capacity` trigger, so the UI blocks before the round trip.
- Header shows filled chairs, capacity, and assigned-roster count from separate counts, with an over-capacity banner.
- Move flow: query sibling sections of `section.class_id` with their active-student counts, then update `students.section_id`/`class_id` per selected student; the existing `release_seat_on_section_change` trigger frees stale chairs and `enforce_section_capacity` blocks overfilling. Errors are surfaced per student. Invalidate `section-seats`, `seating-students`, `class-students`, and `sections`.
- The "increase room size" action updates `sections.capacity`.
- No database migration required — the capacity rule and `set_section_seat` stay as they are.
