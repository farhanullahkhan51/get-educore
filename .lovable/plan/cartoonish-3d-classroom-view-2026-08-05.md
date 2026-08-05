# Cartoonish 3D Classroom View

Replace the flat seat grid with a playful, isometric-style classroom: off-white room, brown wooden desks and chairs, a green/dark board on the front wall, and the teacher's desk in the top-left corner.

## Layout rules

- Seats are arranged in rows of 10, grouped as 5 pairs (two chairs side by side, gap between pairs = aisle).
- 3 rows by default (30 seats). If capacity is above 30, add a 4th row with the same paired style, and continue adding rows of 10 for larger capacities.
- The last row shows only as many chairs as the capacity allows (e.g. 35 -> 4th row has 5 chairs).
- Teacher's desk sits top-left of the room, board mounted on the back wall behind it.

```text
[ BOARD ================= ]
[desk]
   [C C]  [C C]  [C C]  [C C]  [C C]
   [C C]  [C C]  [C C]  [C C]  [C C]
   [C C]  [C C]  [C C]  [C C]  [C C]
   [C C]  [C C]                        <- only if capacity > 30
```

## Visual style

- Room floor rendered in perspective (CSS 3D transform) so back rows sit smaller/higher, front rows larger — a simple 3D classroom view.
- Off-white walls and floor, warm brown wood chairs and desks drawn as small cartoon SVG chair+desk units (seat, backrest, legs, desktop) with soft shadows.
- Occupied seats show a cartoon student avatar bubble with initials in the chair; empty chairs stay plain wood with the seat number.
- Teacher's desk is a larger brown desk with a chair; assigned teacher appears as an avatar behind it.
- Hover lifts the chair slightly; selected seat gets a highlight ring.

## Behaviour (unchanged)

Drag a student onto a chair, or tap student then tap chair; drag chair-to-chair swaps; the X control unseats. Auto-fill, Clear, seated counter, and teacher assignment all keep working exactly as today.

## Technical notes

- Only `src/components/classroom/seating-chart.tsx` changes; no schema, query, or write-logic changes.
- Chairs become a small `<ChairSVG>` sub-component (wood tones from new design tokens, not hardcoded colors).
- Add classroom tokens to `src/styles.css` (`--classroom-wood`, `--classroom-wood-dark`, `--classroom-floor`, `--classroom-wall`, `--classroom-board`) so the room theming stays in the design system.
- Row/pair math: `rows = ceil(capacity / 10)`, seat index maps to row/pair position; pairs use flex with a wider gap between pairs.
- Perspective via a wrapper with `perspective` + `rotateX` on the floor plane, with counter-rotated chair sprites so faces stay readable; falls back to a flat view on small screens.
