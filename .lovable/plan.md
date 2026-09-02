# White-label: what exists today, and what's missing for Google

## What already works (verified in the code)

- Every institution is a tenant row with its own slug, optional custom domain, logo, favicon, colours, font, letterhead, signature and currency/timezone.
- The app resolves the tenant from the browser hostname (`resolve_tenant_by_host`) and applies that institution's colours, font, logo, favicon and browser tab title at runtime. So on-screen the client sees only their own name, never EduCore.
- Platform Admin can create tenants, set a custom domain, and see a domain status badge; there is also a per-tenant preview mode.
- Data is isolated per tenant through row-level security.

## What does NOT work yet — the honest answer on Google

**Today: no. A client's institution would not show up correctly in Google search.** Three concrete reasons:

1. **The HTML sent to Google still says "EduCore".** The page title, description and social preview are hard-coded in the app shell; the institution's name is only swapped in by JavaScript after the page loads. Search crawlers and WhatsApp/Facebook link previews read the first HTML response, so they see "EduCore — School & College Management ERP".
2. **The custom domain field is just a text box.** Nothing verifies the domain, issues an SSL certificate, or actually routes `portal.theirschool.edu.pk` to the app. The status badge is stored, not checked.
3. **There is no robots.txt, sitemap, or per-institution public page** that Google could index in the first place. The only public pages are the landing page and the inquiry form.

Also worth knowing: the app itself is mostly a private, logged-in system. Even fully white-labelled, Google will only ever index the public surface (landing page + inquiry form) — not the dashboard. Most institutions keep their marketing site separate and use this ERP at a subdomain like `portal.theirschool.edu.pk`.

## What to build to make white-labelling real

### 1. Server-rendered tenant branding (the part that fixes Google)
Resolve the tenant on the server from the request hostname, before the page is sent, so the HTML already contains:
- `<title>` and description using the institution's name
- `og:title`, `og:description`, `og:image` (their logo/letterhead)
- their favicon
- their theme colours inlined, so there is no flash of EduCore navy on first paint

This makes search results, WhatsApp shares and browser tabs show the institution, not EduCore.

### 2. Custom domain, done properly
- Platform Admin shows the exact DNS record the client must add (CNAME + a TXT verification token — the token column already exists).
- A "Verify" action checks DNS live and moves the status through pending → verifying → verified → active.
- Documentation of the one-time step needed on the hosting side to attach the domain and issue SSL.
- Until a custom domain is active, each institution gets `theirslug.yourdomain.com` automatically.

### 3. Public, indexable institution page
A branded public page per tenant (name, campuses, programmes, admissions call-to-action, inquiry form link) with proper headings, JSON-LD `EducationalOrganization` markup, a per-tenant `robots.txt` and `sitemap.xml`. This is what actually earns a Google listing.

### 4. Remove remaining EduCore traces
- Fallback name "EduCore" only used when no tenant resolves (your own marketing host).
- Emails, printed challans, certificates and report cards all carry the tenant letterhead — audit each print template.
- Error pages, 404 and the sign-in screen use tenant branding too.

### 5. Sell it as a plan feature
Custom domain stays an Enterprise (or paid add-on) entitlement; subdomain white-labelling is included in every tier.

## Technical notes

- Tenant resolution moves into a server function / root `beforeLoad` keyed on the request `Host` header, feeding the root route's `head()`; the existing client-side `TenantProvider` keeps handling live preview and post-load updates.
- `resolve_tenant_by_host` already returns everything needed, so the server path can reuse it with the publishable client.
- DNS verification runs in a server route using a DNS-over-HTTPS lookup; no new dependency.
- Add `src/routes/api/public/robots[.]txt` and sitemap handlers that branch on hostname.
- No schema change required: `custom_domain`, `custom_domain_status` and `domain_verification_token` already exist on `tenants`.

## Scope note

This covers making each institution look and index as its own brand. It does not add self-serve signup or payment collection — you still assign plans and domains from Platform Admin.
