# White-label the AI Assistant (own OpenAI key + tenant usage caps)

Goal: the assistant keeps working exactly as it does today, but calls OpenAI directly with your own API key, carries no trace of the platform it was built on, and每 tenant has a usage cap and a usage dashboard in Platform Admin.

## 1. Switch the assistant to your own OpenAI account

- Store your OpenAI key as a backend secret (`OPENAI_API_KEY`). It stays server-side and is never exposed to any tenant.
- Rewrite the assistant provider so chat and voice call `api.openai.com` directly instead of the gateway:
  - Chat stays on the OpenAI Responses API, so tools, reasoning, undo and confirmations behave identically.
  - Voice transcription calls OpenAI's transcription endpoint directly.
- Drop the gateway-specific headers and run-id plumbing that identify the build platform, plus the branded error-reporting hooks so nothing in network traffic, error messages or the UI names the platform.
- The model name becomes a backend setting (`ASSISTANT_MODEL`) so you can move to a cheaper or newer OpenAI model without a code change.

## 2. Usage metering per tenant

- New `ai_usage` table: tenant, user, date, feature (chat / voice), request count, input tokens, output tokens, estimated cost.
- Every assistant request writes one usage row after the response finishes, using the token counts OpenAI returns.
- New `ai_usage_limits` table: per-tenant monthly caps (requests and/or cost) with an optional global default for new tenants.

## 3. Cap enforcement

- Before each assistant request the backend sums the tenant's current-month usage:
  - Under 80% of cap: normal.
  - Over 80%: the assistant answers normally and the chat panel shows a soft "approaching your monthly AI allowance" notice.
  - Over 100%: the request is refused with a clean in-app message ("Your institution has reached its monthly AI allowance. Contact your administrator."), no platform names, no raw provider errors.
- Caps reset on the first of each month automatically.

## 4. Platform Admin: AI usage dashboard

Add an "AI Usage" section to the Platform Admin console:
- Table of tenants with this month's requests, tokens, estimated cost, cap and % consumed, with over-cap tenants highlighted.
- Per-tenant detail: daily usage chart, split between chat and voice, and the last requests.
- Inline editing of each tenant's monthly cap, plus a default cap for new tenants.
- Only reachable by your platform-level roles (`educore_ceo` / super admin), never by tenant admins.

## 5. Verification

- Run a real assistant message and a real voice command end to end, confirm the reply streams, tools still run, and a usage row is written with real token counts.
- Temporarily set a tiny cap on a test tenant and confirm the block message appears and no OpenAI call is made.
- Check the network traffic and error surfaces for any remaining platform branding.

## Technical notes

- `src/lib/ai-gateway.server.ts` is replaced by `src/lib/ai-provider.server.ts` using `createOpenAI` from `@ai-sdk/openai` with the default OpenAI base URL and `apiKey: process.env.OPENAI_API_KEY`.
- `src/routes/api/chat.ts` and `src/routes/api/transcribe.ts` switch to that provider; the model id changes from the gateway's prefixed id to the plain OpenAI id read from `ASSISTANT_MODEL`. The exact id is confirmed with one live request before finishing.
- Usage is recorded in `streamText`'s `onFinish` from `usage` (input/output tokens); cost is computed from a per-model rate table kept in one server module.
- Both new tables are tenant-scoped with RLS: tenant members read only their own tenant's usage; only platform roles read all and write limits. Grants for `authenticated` and `service_role` included in the migration.
- Cap checks run in the route handler before the model call, so a blocked request costs nothing.
