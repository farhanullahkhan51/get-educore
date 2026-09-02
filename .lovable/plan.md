# What to build next

Signup, pricing, trials and bank-transfer billing are in place. Three things are still open from the approved billing work, and then the platform is ready for the next growth feature.

## 1. Finish the trial (highest priority)

**Read-only mode on expiry** — today an expired trial only shows a banner; nothing actually stops writes. Add enforcement on both sides:
- Client: block create/edit/delete actions across students, admissions, fees, results and certificates with a clear "Your trial has ended — choose a plan" prompt instead of a silent failure.
- Server: the same check inside the database, so an expired workspace cannot be written to from anywhere. Reading, exporting and printing stay fully available; nothing is deleted.

**Reminder emails** — day 6, day 14 and expiry day 20, sent per institution with its own branding, plus a "payment received" confirmation when you mark a bank transfer paid. Needs a daily scheduled job and an email sender.

## 2. Clean up the plan tiers

The plan list still holds a leftover duplicate ("Professional" alongside "Pro") and several tiers have blank feature settings, which currently reads as "everything included". Merge the duplicate into Pro, move any institution pointing at it, and set explicit features and limits on Starter / Pro / Enterprise so the gating you already built actually differentiates the tiers.

## 3. Tighten signup security

Public signup creates a real workspace and an admin account, so it needs: email verification before the workspace goes live (or at minimum a verified-email badge), IP-based rate limiting in addition to the per-email cap, and a review of the database helper functions flagged by the security scan during the billing migration.

## Then — the biggest missing modules

In rough order of value for a school ERP:

1. **Timetable / scheduling** — periods, teacher availability, clash detection, printable class and teacher timetables. The most requested missing piece.
2. **Communications** — SMS/email/WhatsApp announcements to guardians, fee reminders, absence alerts, with templates and delivery logs.
3. **Guardian portal** — parent login showing their children's attendance, results, fees and challans (the student portal already gives you most of the plumbing).
4. **Bulk import / export** — CSV import for students, staff and marks; Excel/PDF exports everywhere.
5. **Online fee payment** — parents pay a challan by card or local wallet instead of visiting a bank.

## Technical notes

- Read-only enforcement: a helper that returns whether the tenant is writable, called from a shared write guard on the client and enforced by RLS `WITH CHECK` on tenant-scoped tables plus a check inside privileged server functions.
- Reminders: a daily scheduled call into a public API route with a shared secret, which finds subscriptions hitting day 6 / 14 / 20 and sends through the platform email sender, recording each send so nothing goes twice.
- Tier cleanup runs as a migration: repoint any subscription/tenant referencing the duplicate tier, delete it, then set explicit feature flags and limits per tier.
