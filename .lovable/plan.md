# What to build next

Security hardening is done. Two things are still open from the agreed order, plus a set of accuracy fixes the audit turned up. Suggested order below.

## 1. Finish the white-label experience

- The public pages (home, pricing, enquiry, signup) have no per-page title or description at all right now, so search results and shared links look generic. Give each one proper titles/descriptions built from the institution's own name and logo when the visitor arrives on that institution's address.
- Add the two files search engines look for (a site map and a crawl file) so each institution's public pages can be indexed under their own address.
- Custom domains: institutions can enter one, but nothing checks it. Add a "Verify domain" button that checks the DNS record, shows the exact record to add, and marks the domain verified/pending/failed. Once verified, that address serves the institution's branding.
- Replace the remaining "EduCore" wording on public pages and outgoing emails with the institution's own name.

## 2. Correct the numbers shown across modules

- Dashboard, Fees and plan-usage figures are counted from rows fetched into the browser, which stops at 1,000 rows — totals silently under-report for larger institutions. Switch these to database-side counts and sums.
- Fees summary currently uses only the most recent 500 challans; billed / collected / outstanding / defaulters will be wrong for a busy campus.
- Money on the Dashboard shows raw numbers; format it with the institution's currency like the Fees page.
- Lists that are intentionally capped should say "showing first N".

## 3. Communications module

Guardian contacts, message templates with placeholders, send by class/section/individual, email first with SMS as a pluggable provider, plus history and delivery status. Reachable from the sidebar and from the students and fee-challan lists, gated by plan.

## Technical notes

- SEO: per-route `head()` on `/`, `/pricing`, `/inquire`, `/signup` sourced from the resolved tenant; new `/sitemap.xml` and `/robots.txt` server routes; canonical tags from the resolved public origin.
- Domain verification: server function doing a DNS lookup, writing `custom_domain_status` on `tenants`; `resolve_tenant_by_host` prefers a verified custom domain.
- Counts: replace client-side `.length` aggregation with `count: 'exact', head: true` queries and SQL aggregates (a `dashboard_stats` RPC where several sums are needed in one round trip).
- Communications: new `guardians`, `message_templates`, `messages`, `message_batches` tables with RLS + GRANTs, sending through the existing Resend sender, entitlement key `communications`.

## Note

Billing emails still need a verified sender domain in Resend before reminders actually deliver — currently the sender domain is rejected.
