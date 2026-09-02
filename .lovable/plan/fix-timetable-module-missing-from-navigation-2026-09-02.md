# Fix: Timetable module missing from navigation

## What's actually wrong

The Timetable page exists and its route is registered — the problem is only that it never appears in the sidebar.

The sidebar does not render the navigation list directly. It renders an editable, reorderable list driven by a central block registry (`src/lib/ui-surfaces.ts`), and any navigation entry that is not listed there is silently skipped. The `sidebar` surface lists every module except `/timetable`, so the Timetable link is dropped even though the menu item and route are correct.

## The fix

1. Add a `{ id: "/timetable", label: "Timetable" }` block to the `sidebar` surface in the registry, positioned next to Academics/Results so it lands in a sensible spot for institutions that have never customised their layout.
2. Verify the mobile navigation and any quick-link surfaces use the same registry; if they have their own block list, add Timetable there too.
3. Confirm the page is reachable and visible for a super admin, campus admin, and teacher, and that it stays hidden on Starter (where the timetable feature flag is off).

## Note on saved layouts

Saved layouts are merged over the registry and unknown ids are ignored, so once the block exists, existing tenants pick up the new item automatically without resetting their customised order.

## Technical detail

- Edit: `src/lib/ui-surfaces.ts` — `SURFACES.sidebar` block list.
- No change needed to `src/components/layout/app-shell.tsx` (nav item and feature gate already correct), `src/lib/entitlements.ts`, the route file, or the database.
