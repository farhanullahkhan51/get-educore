# Preview any tenant's interface and font from Platform Admin

Yes — this is worth adding. Today the branding a Super Admin sees is always resolved from the hostname they are on, so there is no way to check how another institution's portal actually looks. The tenant settings dialog lets you edit a logo, colours and font, but you cannot see the result applied to the real interface. That makes onboarding and support work guesswork.

## Current state (verified)
- Each tenant row in Platform Admin has three actions: branding settings, edit, delete. There is no preview action.
- Branding is resolved once per session from the browser hostname and applied to the app's theme variables and font. Nothing in the app can currently be told to use a different tenant's branding.

## What will be built

**1. A "Preview" action on every tenant row**
An eye icon next to the existing actions. Tapping it switches the whole app into that tenant's look: their colours, logo, favicon and font applied to the real sidebar, headers, cards and buttons — not a mock-up.

**2. A preview banner**
While previewing, a slim bar sits at the top of the screen: "Previewing <Tenant name> — Exit preview". It stays visible on every page so a Super Admin can navigate the real modules and see how they render for that institution. Exiting restores their own branding immediately.

**3. Preview is visual only**
Data stays exactly as the signed-in user's permissions allow; nothing is impersonated at the database level and no records change. This keeps the feature safe and avoids any risk of editing the wrong tenant's data by accident.

**4. Live preview inside the branding dialog**
While editing a tenant's colours and font, a compact preview panel shows a sample header, button, badge and body text using the values currently in the form — so choices can be judged before saving.

## Technical notes
- Add an optional preview override to the tenant context provider (`src/lib/tenant-context.tsx`): when set, its branding values drive the theme variables and `--font-sans` instead of the host-resolved tenant. Stored in `sessionStorage` so it survives navigation but never leaks into a new session.
- The preview banner renders in `src/components/layout/app-shell.tsx`, shown only when an override is active.
- `src/routes/_authenticated/platform.tsx`: add the preview action, load the target tenant's settings row, and set the override.
- The in-dialog live preview is a local component driven by the existing form state — no new queries.
- No database changes and no new permissions; only platform-level admins can reach this page.

## Out of scope
- Acting as a tenant for data purposes (viewing their students, fees, etc.). That is a separate, higher-risk "impersonation" feature and is not part of this change.
