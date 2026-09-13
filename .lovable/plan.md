# What's left in EduCore

The system is feature-complete for day-one use. Below is everything genuinely outstanding, in the order I'd do it.

## 1. Plan restrictions that can be bypassed (do first)

Timetable and Insights are hidden from the menu when a plan doesn't include them, but typing the address still opens them. Both screens get the same "not in your plan" lock the other modules already use, with an upgrade link.

Also confirm the assistant, full branding, custom domain and edit mode respect the plan the same way, and lock any that don't.

## 2. Card payment on the billing page

The billing page still says "Card checkout — coming soon"; bank transfer is the only way to pay. Two options:

- Remove the greyed-out card line so nothing unfinished is visible at launch, or
- Turn on real card checkout (Stripe or Paddle) so institutions can subscribe themselves.

I need your call on which one before building.

## 3. Page titles inside the app

Every signed-in screen currently shows the same browser tab title. Each module gets its own title and description (Students, Fees, Classes & Sections, and so on), and the sign-in page gets one too. Public pages already have theirs.

## 4. Communications module (the one module never built)

Nothing exists yet for announcements, notices or a notification bell. This was always planned for after launch. It would cover:

- Announcements to a whole institution, a campus, a class or a section
- A notification centre in the top bar with unread counts
- Automatic notices for fee due, low attendance, results published and certificate issued
- Optional email delivery for the same notices, using the sender already set up for billing

This is the largest remaining piece and I'd schedule it after launch day unless you want it now.

## 5. Launch rehearsal

Before real data goes in: walk a fresh institution through signup, branding, campus, classes, students, staff, attendance, marks, fees, a certificate and the student portal — on desktop and mobile, signed in as each role.

## Technical notes

- Gating: wrap `src/routes/_authenticated/timetable.tsx` and `insights.tsx` in `FeatureGate` (feature keys `timetable`, `insights`); audit `ai_assistant`, `branding_full`, `custom_domain`, `edit_mode` consumers.
- Titles: add `head()` with unique title/description to the 18 `_authenticated/*` route files and `auth.tsx`; keep `noindex` semantics, no og:image.
- Communications: new `announcements` + `notifications` tables with tenant/campus scoping, RLS and grants; server functions for send/mark-read; bell in `app-shell.tsx`; reuse `email.server.ts` for delivery.
- Card checkout only if approved: Stripe or Paddle via the platform payment integration, tied to existing plan tiers in `src/lib/billing.ts`.
