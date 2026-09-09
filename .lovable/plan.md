# Smooth, instant module switching and UX polish

Goal: moving between modules feels instant, nothing already loaded is fetched again from scratch, and no in-progress work is lost.

## 1. Instant switching

- Pages start loading the moment a menu item is hovered or touched, so the screen is usually ready before the tap lands.
- Data already seen stays in memory for a few minutes, so returning to a module shows it immediately and refreshes quietly in the background.
- Each module keeps its search text, filters and scroll position when you leave and come back within the session.
- Sidebar highlights the destination straight away and shows a thin top progress line while the next screen finishes loading.

## 2. Never lose work

- Open forms and dialogs with unsaved changes warn before navigating away or closing the tab, with "Stay" and "Discard".
- Draft text in longer forms (student, staff, admissions, certificates, assistant message box) is kept while switching modules in the same session.
- Saves keep working if you navigate mid-save, and success or failure is still reported.

## 3. Loading, empty and error states

- Table and card skeletons replace "Loading…" text, matched to each module's layout, so the page never jumps.
- Consistent friendly error panel with a retry button instead of blank areas.
- Every empty state names a clear next action, keeping the filtered-empty behaviour already built.

## 4. Interaction polish

- Buttons show a spinner and disable while working; no double submits.
- Short, subtle page and dialog transitions; respects reduced-motion settings.
- Mobile: drawer closes on navigation, tables scroll cleanly, tap targets comfortable, safe-area padding.
- Keyboard and screen reader: visible focus, labelled fields, dialogs trap focus and close with Escape, skip-to-content link.

## 5. Verification

- Click through every module twice and confirm second visits render instantly with filters and scroll intact.
- Confirm unsaved-change warning fires on a partly filled student form.
- Check desktop and mobile widths, and a slow-network simulation for skeletons.

## Technical notes

- Router: `defaultPreload: "intent"`, small preload delay, and `defaultPreloadStaleTime` tuned so TanStack Query owns freshness.
- QueryClient defaults: `staleTime` ~60s, `gcTime` ~10 min, `refetchOnWindowFocus: false`, `placeholderData: keepPreviousData` on paginated lists.
- Per-module UI state (search, filter, scroll) held in a small session-scoped store keyed by route, alongside existing `ui-prefs`.
- `useBlocker` from TanStack Router for dirty-form guards, plus `enableBeforeUnload`.
- Shared `<TableSkeleton />`, `<CardSkeleton />` and `<ErrorPanel onRetry />` components reused across modules.
- Global route pending indicator via `useRouterState({ select: s => s.status })`.
- No visual redesign, no data-model changes.
