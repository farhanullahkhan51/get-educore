# Launch readiness: final white-label, security, accuracy and UX pass

Goal: everything an institution touches tomorrow works correctly with real data — correct figures, safe access, working branding and email, and no dead ends in the interface.

## 1. Data correctness with real volumes

- Remove every remaining uncapped browser fetch. Paginate students, staff, inquiries, fee challans, bank transactions, attendance, certificates, results and seating so lists stay complete past the backend's row cap.
- Make all visible counts and group headings come from exact database totals, never from the rows a page happened to load.
- Re-verify the known baseline after changes: 2 overdue challans, PKR 56,000 billed, PKR 20,000 collected, PKR 36,000 outstanding.
- Fix the one section that currently holds 49 students against a capacity of 30: show it clearly as over capacity with a guided way to move students, without moving anyone automatically.
- Currency, dates and percentages formatted consistently everywhere (institution currency and timezone from settings), including printed documents.

## 2. Empty, loading and error states

- Every module gets a proper first-run empty state with a clear next action, since tomorrow every table starts empty.
- Loading skeletons instead of blank panels; friendly error panels instead of raw failures.
- Every save, delete and import gives a clear success or failure message, and failures explain what to do.

## 3. White-label completion

- Confirm tenant name, logo, favicon, colours and font apply on every screen, printout and email — no leftover "EduCore" text for a paying institution.
- Public pages (home, pricing, enquiry, signup) carry the institution's own title, description and preview image, with correct canonical links, sitemap and robots.
- Custom domain: verification check, clear DNS instructions, live status, and verified domains taking priority over the default address.
- Billing and notification emails send from a verified sender; today's setup fails because the sender domain is unverified. Verify the domain or switch to one that is, then send a real test email.

## 4. Security and access

- Re-run the full security review after all changes and resolve or explicitly justify each finding.
- Confirm one institution can never see another's records: test with two accounts across every module, including reports, exports, printing and the assistant.
- Confirm each role sees only what it should: students only their own records; teachers only their sections; finance only finance; institution admin only their institution; platform owner across institutions.
- Confirm expired or suspended institutions become read-only everywhere, including bulk import, printing actions and the assistant.
- Confirm no keys or secrets are reachable from the browser, and that the assistant's provider is never named to the institution.

## 5. Plan limits and paid features

- Student, staff and campus limits enforced in the database and clearly explained in the interface before the user hits them.
- Features not included in a plan are hidden or clearly locked, in navigation and inside modules, with an upgrade path.
- Assistant message allowance counted per institution with a clear message when reached.

## 6. Interface and experience polish

- One consistent page pattern: heading, actions, filters, content, pagination.
- Full mobile pass on every module: navigation, tables that scroll or stack, dialogs that fit, tappable controls.
- Keyboard and screen-reader basics: labels on every field, visible focus, dialogs that trap focus and close on escape.
- Print and export checks for challans, certificates, report cards, statements of entry and roll-number slips.
- Remove any half-built control or link that leads nowhere.

## 7. End-to-end rehearsal before go-live

Walk the real workflow with a fresh institution: sign up, choose plan, set branding, add campus, classes and sections, import students and staff, assign teachers, build a timetable, take attendance, enter assessments, publish report cards, generate and collect fees, match a bank payment, issue a certificate, register a board and a Cambridge candidate, and view the student portal. Every step verified on desktop and mobile, signed in as each role.

## Technical notes

- Database-side aggregates and paginated queries; no client-side totalling of partial data.
- All new access rules through migrations with row-level security and grants; no broad anonymous access.
- Type check, database integrity queries, security and dependency scans, and authenticated browser runs as the verification gate.
- No visual redesign and no new modules (Communications stays for after launch) unless a gap blocks day-one use.
