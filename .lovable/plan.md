# Finish the white-label experience

Goal: an institution's public pages look, read and get found as theirs — not EduCore's.

## 1. Public pages carry the institution's identity

- Home, pricing, enquiry and signup currently have no page title or description of their own, so shared links and search results look generic. Give each one a title and description built from the institution resolved by the web address the visitor came in on, falling back to EduCore on the platform's own address.
- Show the institution's logo, name and colours on those public pages, the same way the signed-in area already does.
- Replace remaining hard-coded "EduCore" wording in public page copy and outgoing emails with the institution's name.

## 2. Be findable

- Add the two files search engines look for: a site map listing the public pages, and a crawl-permission file.
- Add a canonical link on each public page pointing at itself on the address the visitor used.

## 3. Custom domains that actually work

- Institutions can already type a domain, but nothing checks it. Add a "Verify domain" action that looks up the DNS record, shows the exact record to add, and marks the domain pending, verified or failed.
- Once verified, that address serves the institution's branding, and it wins over the slug address when both match.
- Show the DNS instructions and current status in Platform Admin and in the institution's own settings.

## Technical notes

- Per-route `head()` on `/`, `/pricing`, `/inquire`, `/signup`, sourced from a server-side host resolution (server fn wrapping `resolve_tenant_by_host` plus request origin) so metadata is correct on first render, not after hydration.
- Canonical in `links` on leaf routes only; `og:type` and `twitter:card` set; no `og:image` unless a real absolute image exists.
- `src/routes/sitemap[.]xml.ts` server route generating URLs from the resolved host; `public/robots.txt` with `Allow: /`.
- Domain verification: server function doing a DNS TXT/CNAME lookup, writing `custom_domain_status` (enum already exists on `tenants`); `resolve_tenant_by_host` prioritises a verified custom domain.
- No new tables. Platform Admin gains a verify button + status badge next to the existing `custom_domain_status` display.

## Not in this step

Number-accuracy fixes (dashboard/fees totals) and the Communications module stay queued for after this.
