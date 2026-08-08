# iOS-style wiggle in edit mode

Make editable blocks jiggle like iPhone home-screen icons whenever layout edit mode is active.

## What changes

- Add a `wiggle` keyframe animation to the global stylesheet: a small alternating rotation (about ±0.7deg) with a tiny vertical nudge, ~0.35s, infinite, ease-in-out.
- Add two slightly offset variants (`animate-wiggle` / `animate-wiggle-alt` with different delay and direction) so neighbouring blocks don't move in lockstep — that unsynced feel is what makes the Apple effect read correctly.
- Apply the class to each editable item while `editing` is true:
  - dashboard/module grid blocks (`EditableGrid`)
  - sidebar entries (`EditableList`)
  - tab triggers (`EditableTabsList`)
  Alternate the two variants by index.
- Pause the wiggle on the block currently being dragged so it stays steady under the cursor.
- Respect `prefers-reduced-motion`: no animation for users who ask for reduced motion.

## Technical notes

- Keyframes and the `animate-wiggle*` utilities go in `src/styles.css` (Tailwind v4 `@theme` / plain CSS), transform-origin center.
- Class application happens in `src/components/layout/editable.tsx` alongside the existing `editing &&` conditional classes; no layout or persistence logic changes.
