# Next up: Timetable & Scheduling

Billing, trials, reminders, plan tiers and signup security are now complete. The most-requested missing module for a school ERP is the timetable — this adds it end to end.

## What you'll get

- **Period structure per campus** — define school days, number of periods, start/end times, and breaks once per campus.
- **Timetable grid per section** — assign subject (course) + teacher + room to each period slot, with a visual weekly grid.
- **Clash detection** — the system warns and blocks when a teacher or room is double-booked in the same period.
- **Teacher view** — a teacher sees only their own weekly timetable; admins see everything.
- **Printable timetables** — clean print layouts for a class timetable and a teacher timetable, using the institution's branding (logo, colors, fonts).
- **Plan gating** — timetable becomes a feature flag on the plan tiers (on for Pro and Enterprise, toggleable for Starter) so it differentiates your tiers.

## Pages and changes

1. New **Timetable** module in the sidebar (Super Admin, Campus Admin, Teacher roles), with three tabs: Periods, Section timetables, Teacher timetables.
2. Weekly grid editor: pick a section, click a slot, choose course/teacher/room. Clashes highlighted in red and blocked on save.
3. Teacher tab: pick a teacher (teachers see themselves automatically) and view/print their week.
4. Print view with the tenant letterhead styling.

## Technical details

- Migration creates `timetable_periods` (campus, day, period number, start/end time, is_break) and `timetable_entries` (section, period slot, course, teacher, room) with RLS, GRANTs, and a unique constraint per (section, slot), (teacher, slot) and (room, slot) enforced through a clash-check before insert.
- New route `src/routes/_authenticated/timetable.tsx` + nav item gated by a new `timetable` feature key in `entitlements.ts` and the tier feature flags.
- Reuses existing tables: sections, courses, staff — no duplication.
- Print uses the existing letterhead/branding tokens from tenant settings.

## Out of scope (can follow after)

- Auto-generating a timetable from teacher availability (manual assignment first).
- Substitute-teacher management and timetable change history.
