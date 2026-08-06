# Let the AI Assistant reshape the interface

Yes — this is doable, with one important boundary: the assistant should not write new screens on the fly (that is unpredictable and can break pages). Instead it gets a set of **layout controls** for each module, which it can change on request and which the modules read every time they render. To you it feels the same: "separate Board classes from Cambridge classes" and the Classes page reorganises itself immediately.

## What the assistant will be able to change

Per module (Classes & Sections, Students, Staff, Courses, Fees, Admissions, Certificates, Results):

- **Grouping / splitting** — e.g. split Classes into Board and Cambridge groups, group Students by class or campus, group Fees by status
- **Filtering** — e.g. "only show Cambridge classes", "only unpaid challans"
- **Sorting** — by name, code, date, amount, capacity
- **Visible columns / fields** — hide what you never use
- **Presentation** — table vs cards, compact vs comfortable density
- **Default tab** — which tab a module opens on

Examples that will work by voice or text:
- "Separate Board and Cambridge classes so they don't get mixed up"
- "On Students, group by section and hide the guardian occupation column"
- "Make the fees list compact and sort by outstanding amount"
- "Put everything back to default"

## How it behaves

- Changes are **personal by default** — they apply to your own view only, so you can't disrupt other staff.
- Admins get an extra step: after a change is applied, the assistant offers "make this the default for everyone in the institution". Institution defaults are inherited by users who haven't set their own.
- Like all write actions today, an interface change is **proposed first** with a Confirm / Cancel card in the chat, and it's recorded in the audit log.
- Every module gains a small "Layout" control in its header showing the active view, with a one-click **Reset to default** — so nothing the assistant does is a trap.
- Changes apply instantly on the open page, not after a refresh.

## Build order

1. Storage + a shared layout-preferences provider, plus the Confirm card wiring (reuses the existing approval flow).
2. Assistant tools: read current layout, set layout, reset layout — with the module and options validated so it can only pick real, supported choices.
3. Classes & Sections first (the Board/Cambridge split), end to end, including the header control and reset.
4. Roll the same pattern out to Students, Staff, Courses, Fees, Admissions, Certificates, Results.
5. Institution-wide defaults for admins.

## Technical notes

- New table `public.ui_preferences` with `(user_id | null, tenant_id, module, prefs jsonb)`; a null `user_id` row is the tenant default. RLS: a user reads/writes only their own row plus their tenant default; only admin roles may write the tenant-default row. GRANTs for `authenticated` + `service_role`.
- A `UiPrefsProvider` (sibling of `tenant-context.tsx`) loads all rows once via React Query and exposes `useModuleLayout("classes")` returning a merged object (defaults → tenant default → personal). Modules read it; no page-level fetching.
- Each module declares a small schema of allowed layout keys and values (`groupBy`, `filter`, `sortBy`, `hiddenColumns`, `view`, `density`, `defaultTab`). The assistant tools validate against that registry with zod, so the model can never set an unsupported value.
- New tools in `src/lib/assistant-tools.server.ts`: `get_module_layout`, `set_module_layout` (write → `needsApproval`), `reset_module_layout`, plus a `list_module_layout_options` read tool so the model knows what's available before proposing.
- After an approved change the chat client invalidates the `["ui-prefs"]` query so the open module re-renders immediately.
- The assistant's system prompt gains a short section: interface requests go through these tools, never through free-form code.

## Out of scope

- Free-form UI generation (the assistant writing new components or pages). Not included — it can't be validated and would break screens.
- Changing branding (colours, logo, font) — that already exists in tenant settings and stays there.
