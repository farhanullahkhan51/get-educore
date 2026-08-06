# Give the AI Assistant full write control

Yes — this is doable. Today the assistant only has read tools (counts, searches, summaries). We add a set of **action tools** so it can create, edit and delete records across the modules, driven by text or voice, with the same permissions the signed-in user already has.

## How it will work

- The assistant runs every action through the signed-in user's own database session, so it can never do anything the user isn't allowed to do (role + campus + tenant rules still apply).
- Any action that changes data is **proposed first**: the assistant shows a compact summary ("Create course CS-101 'Computer Science', Board, Grade 9, Main Campus — confirm?") and only writes after the user approves in the chat (a Confirm / Cancel pair of buttons). Deletes always require confirmation; reads never do.
- Multi-step requests work in one go: "add a Cambridge course and enroll Ali in it" becomes a short list of proposed steps that the user approves once.
- Every write is recorded in the audit log with the actor, so there's a trail of what the assistant did.
- Voice input already feeds the same chat, so spoken commands go through the identical flow.

## What the assistant will be able to manage

- **Students** — add, edit, change class/section/status, delete
- **Staff** — add, edit (including teaching track), delete
- **Academics** — programs, classes, sections, courses (Board and Cambridge), course/teacher assignments
- **Admissions** — log an inquiry, move its status, convert to student
- **Fees** — fee structures, issue challans, record payments, scholarships
- **Attendance & results** — mark attendance, enter assessment marks, generate/publish report cards
- **Certificates** — issue and revoke
- **Look-ups** — resolve names the user says ("Grade 9 Red", "Ali Khan") to the right record, and ask back when a name is ambiguous

## Build order

1. Confirmation plumbing in the chat (proposal card, Confirm/Cancel, execution) — the safety layer everything else depends on.
2. Students + staff write tools (the most-used ones), end to end.
3. Academics: programs, classes, sections, courses, assignments.
4. Admissions and fees.
5. Attendance, results, certificates.
6. Audit-log coverage and a "what did you just change?" recap tool.

## Technical notes

- New tools live alongside the existing ones in `src/routes/api/chat.ts`, built on the request-scoped Supabase client from `getRequestUser` so RLS is enforced per user — no service-role/admin client anywhere in the assistant path.
- Write tools use the AI SDK's `needsApproval` on `tool(...)`, with the approval UI rendered from the tool part in `src/components/assistant/chat-workspace.tsx`; approved calls resume the same stream.
- Each tool validates input with zod and returns the created/updated row so the assistant can quote real IDs and codes back.
- Inserts always set `tenant_id`/`campus_id` from the caller's context, never from model output.
- Deletes are hard deletes only where the schema allows it; for records with dependents (student with challans, class with students) the tool refuses and explains, rather than cascading.
- Audit entries are written to `audit_logs` with `action`, `entity_type`, `entity_id` and a details payload.
- Tool count grows past ~30, so tools are grouped per module and the system prompt gains a short routing section; `stopWhen: stepCountIs(50)` already supports multi-step chains.
