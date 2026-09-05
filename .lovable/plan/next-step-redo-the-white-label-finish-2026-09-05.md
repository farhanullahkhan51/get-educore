# Next step: redo the white-label finish

The white-label changes from the last session are no longer in the project — the public pages still carry fixed "EduCore" titles, there is no site map or crawl file, and there is no domain check. So the next step is to rebuild that work, then move on.

## 1. Public pages carry the institution's identity

- Give the home, pricing, enquiry and signup pages their own title and description, built from the institution matched to the web address the visitor arrived on, falling back to EduCore on the platform's own address.
- Show that institution's logo, name and colours on those pages.
- Replace leftover "EduCore" wording in public copy and outgoing emails with the institution's name.

## 2. Be findable

- Add a site map listing the public pages and a crawl-permission file.
- Add a self-pointing canonical link on each public page, using the address the visitor used.

## 3. Custom domains that actually work

- Add a "Verify domain" action that checks the DNS record, shows the exact record to add, and marks the domain pending, verified or failed.
- Only a verified custom domain serves that institution's branding, and it wins over the slug address.
- Show the DNS instructions and status in Platform Admin and in the institution's own settings page.

## Technical notes

- New `src/lib/public-site.functions.ts`: server fn resolving the request host via `resolve_tenant_by_host`, returning brand + origin for `head()` on `/`, `/pricing`, `/inquire`, `/signup`; canonical in `links` on leaf routes; `og:type` and `twitter:card` set; no `og:image` without a real absolute image.
- `src/routes/sitemap[.]xml.ts` server route (public pages only) and `public/robots.txt`.
- New `src/lib/domains.functions.ts`: authenticated DNS-over-HTTPS TXT lookup of `_educore.<domain>` against the existing `domain_verification_token`, writing `custom_domain_status`.
- Migration updating `resolve_tenant_by_host` so a custom domain matches only when `custom_domain_status = 'verified'`. No new tables.
- Verify with a typecheck plus a browser pass over the four public pages, `/sitemap.xml` and `/robots.txt`.

## After this

Number accuracy (dashboard and fees totals computed in the database rather than from capped row fetches), then the Communications module.
