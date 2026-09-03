# Fix billing/security loose ends, then Bulk Import / Export

## Part 1 — Finish the loose ends

### A. Trial reminder emails go live
The reminder schedule (day 6, 14, expiry) and the cron endpoint are built, but emails only "skip" because no email API key is configured.

- Add the `RESEND_API_KEY` secret (I'll ask you for a Resend key — free tier covers this volume, or you can use any Resend-compatible sender).
- Add `BILLING_FROM_EMAIL` (e.g. `billing@yourdomain.com`) so tenant-branded reminders and payment confirmations actually send.
- Test the cron endpoint once end-to-end and confirm a reminder is recorded in `billing_reminders`.

### B. Remediate the 35 security-definer warnings
The database security scan flags all `SECURITY DEFINER` helper functions as callable too broadly.

- Review each flagged function (`has_role`, `is_super_admin`, `get_user_tenant`, `resolve_tenant_by_host`, etc.) via the linter.
- Lock down the ones that don't need to be public: revoke execution from anonymous callers where safe, keep `search_path` pinned (already done), and confirm no function exposes cross-tenant data.
- Where a function genuinely must be callable publicly (e.g. `resolve_tenant_by_host` for branding, `slug_available` for signup), verify it only returns data safe to expose and mark the finding as reviewed/intentional.
- Re-run the scan to confirm the count drops and nothing broke (login, branding resolution, signup, RLS checks).

## Part 2 — Bulk Import / Export module

A new **Import / Export** page (Super Admin + Campus Admin), reachable from the sidebar.

### Import (CSV / Excel upload)
- **Students**: download a blank template, upload filled CSV, preview rows with validation (duplicates, missing names, unknown class/section matched by name), then confirm to insert in one batch.
- **Staff**: same flow — template, preview, validate, import.
- **Marks**: pick course + section + assessment, download a template pre-filled with the enrolled students, upload filled marks, preview and import into the gradebook.
- Row-level errors are shown per row; valid rows still import, bad rows are reported with reasons and downloadable as an error file.

### Export
- One-click exports as CSV from: Students, Staff, Attendance, Fee challans, Results/marks, Inquiries.
- Exports respect the campus you're viewing and existing permissions (finance exports only for finance/admin roles).
- Print/PDF stays as-is (browser print); CSV export covers the data side.

### Technical details
- No new tables needed: imports write into existing `students`, `staff`, `assessment_scores`; exports read existing tables. RLS and tenant isolation apply automatically.
- CSV parsing client-side with a lightweight parser (no server round-trip until validated); inserts batched through the existing Supabase client so expired-trial read-only enforcement and tenant triggers still apply.
- New route `src/routes/_authenticated/import-export.tsx`, sidebar entry registered in `ui-surfaces.ts`, gated for admin roles only.
- Verification: typecheck, then a live import of a small student CSV and an export download in the preview.

## Out of scope (follow-ups)
- Scheduled/automatic exports, Excel (.xlsx) formatting with styling, and importing historical fee payments.
