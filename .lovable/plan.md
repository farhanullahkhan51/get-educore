# Self-serve signup, 20-day trial, and payment collection

## What this adds

Today you create every institution by hand in Platform Admin and there is no billing. This makes the platform sell itself: an institution signs up on a public page, gets its own branded workspace instantly with a 20-day free trial, then either pays by card or gets activated by you after a bank transfer.

## 1. Public pricing and signup

- **Pricing page** — Starter / Pro / Enterprise side by side with what each includes, monthly and yearly toggle, PKR and USD display, and a "Start 20-day free trial" button. Publicly indexable.
- **Signup wizard** (no payment required to start):
  1. Institution name, contact person, email, phone, city
  2. Choose examination system: BISE Board / Cambridge / Both
  3. Choose plan
  4. Pick a workspace address — `yourschool.<yourdomain>` — checked live for availability
  5. Set a password
- On submit the system creates: the tenant (status `trial`), its settings row with defaults, the first Super Admin account for that institution, and a subscription row with `trialing` and a trial end date 20 days out. The user lands straight in their own branded dashboard.

## 2. The 20-day trial

- A banner across the app shows days remaining, and from day 15 a "Choose a plan" call to action.
- Reminder emails on day 10, day 17, day 19 and on expiry.
- On expiry the workspace goes read-only: data is safe and viewable, but creating students, challans, results and certificates is blocked with an upgrade prompt. Nothing is deleted.
- Trials are capped to the Starter limits unless you grant otherwise.

## 3. Payment collection — two channels

**Card checkout (online, automatic)**
- Built-in card checkout with monthly and yearly prices per tier.
- After a successful payment the subscription flips to `active`, the tenant to `active`, and the plan tier is applied immediately, so all the feature gating you already built starts enforcing the paid tier.
- Renewals, failed payments and cancellations arrive by webhook and update the subscription automatically; a failed renewal moves the tenant to `past_due` with a grace period before read-only.
- Institutions get a Billing page: current plan, next renewal date, payment method, invoices, upgrade/downgrade and cancel.

Important caveat: card checkout requires a seller entity in a supported country — Pakistan-registered sellers are not supported by the built-in providers. If your billing entity is in Pakistan, we ship the manual channel first and turn on card checkout later without rework.

**Bank transfer (manual, for local institutions)**
- The Billing page offers "Pay by bank transfer": the system issues a numbered invoice with your account details and the exact amount.
- The institution uploads a payment proof / transaction reference.
- A **Billing** section in Platform Admin lists pending payments; you mark one as received, choose the period, and the tenant activates on the spot with the invoice marked paid.
- Renewal reminders go out 14 and 3 days before period end.

## 4. Platform Admin additions

- Signups feed a list showing trial status, days left, chosen plan and payment channel.
- Manual controls to extend a trial, change plan, mark paid, suspend or reactivate a tenant.
- Revenue summary: active subscriptions per tier, monthly recurring revenue, trials converting, overdue accounts.

## 5. Guard rails

- Signup is rate-limited and email-verified so nobody can spam workspaces.
- A reserved list blocks slugs like `admin`, `app`, `api`, `www`, `educore`.
- Plan limits (students, campuses, staff, AI messages) are enforced server-side as well as in the UI, so a downgraded institution cannot keep adding beyond its cap.

## Technical notes

- New tables: `invoices` (tenant, number, amount, currency, period, channel, status, proof URL, paid date) and `signup_requests` for pre-verification; `subscriptions` gains `trial_ends_at`, `provider`, `provider_subscription_id`, `billing_email`.
- Tenant provisioning runs in one privileged server function: create auth user, tenant, settings, subscription, first Super Admin role, and Starter-equivalent defaults — all or nothing.
- Card checkout uses Lovable's built-in payments (Stripe or Paddle, decided by an eligibility check once you confirm the billing entity's country) with a signed webhook at `/api/public/billing/webhook` that updates `subscriptions`, `invoices` and `tenants.status`.
- Trial/expiry enforcement lives alongside the existing `useEntitlements` gating plus a server-side check in write paths, so a read-only workspace cannot be bypassed from the client.
- Reminder and invoice emails go out through the platform's email sending, using each tenant's branding.
- Pricing page is a public SSR route with its own metadata; it does not sit behind auth.

## Suggested order

1. Signup wizard + tenant provisioning + 20-day trial (no money involved)
2. Trial banner, expiry read-only mode, reminder emails
3. Bank-transfer invoices + Platform Admin billing controls
4. Card checkout and webhooks once the billing entity is settled
