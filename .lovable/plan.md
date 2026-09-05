# Fix the sign-in page flicker warning

## What's happening

The table list in the Cloud panel is a viewer glitch, not your data — the backend still holds all 48 tables, 2 institutions and 158 students. Reopening the panel or the project tab restores it; there is no code change needed for that.

Separately, the sign-in page is throwing a page-mismatch error in the preview. The branding provider reads a saved "preview branding" value out of browser storage while the very first version of the page is still being built on the server, where that storage does not exist. The two versions disagree, so the whole sign-in screen is thrown away and rebuilt — which shows up as a flash and a console error.

## The fix

- Start the branding preview state empty on first render, and load the saved preview value immediately afterwards, once the page is running in the browser.
- Leave every other behaviour the same: preview branding still applies, still persists per tab, and still clears when reset.
- Confirm the sign-in page loads with no mismatch error and the tenant logo/name still appear.

## Technical detail

In `src/lib/tenant-context.tsx`, `useState(() => readStoredPreview())` reads `sessionStorage` in the initializer, which is server/client divergent. Change the initial value to `null` and hydrate it in a `useEffect` on mount. No change to `setPreview`, the query, or consumers.
