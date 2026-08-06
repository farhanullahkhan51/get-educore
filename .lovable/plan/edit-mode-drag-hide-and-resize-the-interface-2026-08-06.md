# Edit Mode: drag, hide and resize the interface

Yes — this is doable as a controlled **Edit Mode** rather than a free-form page builder. Admins turn on a toggle, the app becomes editable in place (drag handles appear), they rearrange, then save. Everyone else sees the saved result and nothing changes for them.

The important boundary: editing rearranges the blocks the system already has. It does not invent new screens or new widgets — that can't be validated and would break pages.

## What Edit Mode lets an admin do

- **Drag to reorder** — dashboard widgets, KPI cards, sidebar links, page sections, tabs and table columns
- **Hide** — any widget, KPI, column, tab or sidebar link the institution doesn't use
- **Resize** — dashboard widgets snap to a 12-column grid: quarter / third / half / full width, and short / tall
- **Rename** — the visible label of a widget, tab or sidebar link (e.g. "Fees & Finance" → "Accounts")
- **Reset** — per widget, per page, or the whole system, back to the shipped default

Flow: **Edit layout** button in the header → page dims slightly, dashed outlines and drag handles appear → drag / resize / hide → **Save** or **Discard**. Changes are live-previewed while editing, never half-saved.

## Who can edit

Only Super Admin, EduCore CEO and Campus Admin see the Edit layout button. What they save becomes the layout **for everyone in the institution** — there is no personal override in this mode, so the whole staff sees one consistent system. Non-admins get a read-only view exactly as saved.

The existing per-user **Layout** menu (grouping, filtering, sorting, density) stays as it is and keeps working alongside this.

## Where it applies

- **Dashboard** — the 8 KPI cards and the 5 charts/tables become a draggable, resizable, hideable grid
- **Sidebar** — reorder links, hide links, rename links, and group them under custom headings
- **Module pages** (Classes, Students, Staff, Courses, Fees, Admissions, Academics, Results, Certificates, Board, Cambridge, Track Switch, Portal) — reorder and hide the sections/tabs on each page, and reorder/hide table columns
- Role visibility still wins: hiding a link never grants access, and a link a role can't use stays hidden regardless.

## The AI assistant

The assistant gets the same powers through tools, so "move outstanding fees to the top of the dashboard", "hide the Cambridge link for now", "make the attendance chart full width" all work by voice or text, with the usual Confirm card before anything is saved.

## Build order

1. Layout storage + provider + Edit Mode shell (toolbar, dirty state, save/discard, reset).
2. Dashboard grid: drag, resize, hide, rename — the flagship surface.
3. Sidebar editor: reorder, hide, rename, custom groups.
4. Module pages: section/tab order and column order/visibility, reusing the same primitives.
5. Assistant tools for the new capabilities + audit-log entries.

## Technical notes

- New table `public.ui_layouts` — `(tenant_id, scope text, layout jsonb, updated_by, timestamps)` with a unique index on `(tenant_id, scope)`; scopes are `dashboard`, `sidebar`, `module:<name>`. GRANTs for `authenticated` + `service_role`; RLS: read by any member of the tenant, write only when `is_super_admin(auth.uid())` or `has_role(auth.uid(),'campus_admin')`.
- `src/lib/ui-layouts.tsx` — provider loading all scopes once via React Query (`["ui-layouts"]`), exposing `useSurfaceLayout(scope)` returning `{ items, isEditing, move, resize, toggleHidden, rename, save, discard, reset }`. Draft state lives in the provider; nothing is written until Save.
- A **registry** (`src/lib/ui-surfaces.ts`) declares every editable block: stable id, default label, default order, default span, and whether it can be hidden/resized. Saved layouts are merged over the registry and unknown ids are ignored — so new blocks we ship later appear automatically and removed ones can't break a page.
- Drag-and-drop uses the existing pointer-event approach already proven in the seating chart (`src/components/classroom/seating-chart.tsx`) rather than a new dependency: pointer capture, drop-target detection via `elementFromPoint`, auto-scroll during drag.
- `EditableGrid` / `EditableList` wrappers render children by saved order with handles only when `isEditing`; dashboard spans map to Tailwind `col-span-*` on a 12-column grid.
- Sidebar reads its items from the registry merged with the `sidebar` scope, then applies the existing role filter in `src/components/layout/app-shell.tsx` — role filtering runs last and always.
- New assistant tools in `src/lib/assistant-tools.server.ts`: `list_surface_blocks`, `set_surface_layout` (write → `needsApproval`), `reset_surface_layout`, validated with zod against the same registry.
- Every save writes an `audit_logs` row.

## Out of scope

- Free-form page building (creating new screens or new widget types from scratch).
- Editing the data model, forms or business rules through drag-and-drop.
- Per-user personal overrides of this layout (per-user preferences remain in the existing Layout menu).
