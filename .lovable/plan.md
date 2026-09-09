# Why "could not seat students" appears, and how to fix it

## What I confirmed in the live records

- One classroom, **Yellow, holds 42 students but its room size is set to 30**. Two more classrooms (Blue and one Green) are exactly at 30 of 30.
- The seating step refuses to move a student into a classroom that is already at its stated size. That refusal is correct — but the screen only shows a generic "X student(s) could not be seated" and never says why.
- So the message is a real limit being hit, not a broken button. Auto-fill tries to place students who belong to another classroom of the same class, the full-room rule stops them, and the count is reported with no explanation.

## The fix

1. **Say what actually happened.** Replace the generic failure count with the real reason per student, grouped: "3 students could not be seated — Yellow is already full (30 of 30)", "1 student is on a different track", and so on. Single drag-and-drop failures show the same plain-language reason instead of a database message.
2. **Warn before auto-fill starts**, not after: if the class has more students than chairs, show how many will be left out and which classroom they need to move to.
3. **Show the room's true state in the header**: "42 students assigned, 30 chairs" with a clear over-capacity note and a hint to raise the room size or move students to another section.
4. **Skip pointless attempts.** Students who cannot possibly be placed (full room, wrong campus, wrong track, inactive) are filtered out of auto-fill up front so the run reports only genuine placements.
5. **Give a way out.** From the over-capacity note, offer two direct actions: increase this room's size, or open the class roster to move the extra students to another section.

## Operational note

Yellow needs a decision either way: raise its size above 42, or move 12 students to Red (23 of 30) or the Green section with 25 of 30. The software changes above make that choice obvious instead of hiding it behind a failure count.

## Technical details

- `src/components/classroom/seating-chart.tsx`: `autoFill` collects per-student RPC errors and maps Postgres messages (`Section capacity of % has been reached`, academic-system mismatch, inactive student, campus mismatch) to readable text; `seatStudent` uses the same mapping. Add a pre-flight active-roster-vs-capacity check.
- `seatingError` gains a roster-capacity check mirroring the `enforce_section_capacity` trigger, so the UI blocks before the round trip.
- Capacity banner and the two actions live in the seating dialog header; the "increase room size" action updates `sections.capacity`.
- No database migration required — the capacity rule and `set_section_seat` stay as they are.
