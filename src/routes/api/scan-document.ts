import { createFileRoute } from "@tanstack/react-router";
import { generateObject } from "ai";
import { z } from "zod";
import {
  CAP_REACHED_MESSAGE,
  checkTenantCap,
  createAssistantProvider,
  createFallbackProvider,
  markProviderDown,
  recordUsage,
  resolveTenantId,
  selectChatProvider,
} from "@/lib/ai-provider.server";
import { getRequestUser } from "@/lib/supabase-request.server";

const MAX_BYTES = 8 * 1024 * 1024;

const schema = z.object({
  kind: z.enum(["student", "staff", "fee_receipt", "unknown"]),
  legible: z.boolean(),
  qualityIssues: z.array(z.string()),
  authenticityNotes: z.array(z.string()),
  fields: z.array(z.object({ key: z.string(), value: z.string(), confidence: z.number() })),
});

const PROMPT = `You read photos of documents for a school in Pakistan. Accuracy matters more than completeness.
Classify the document:
- "student": B-Form, birth certificate, admission form, student ID card, report card identity section.
- "staff": CNIC of a staff member, CV, appointment letter, staff ID card.
- "fee_receipt": fee challan, bank deposit slip, fee payment receipt.
- "unknown": anything else.
Extract ONLY these keys (omit any key not clearly visible):
student: student_code, first_name, last_name, date_of_birth, gender (male/female), guardian_name, guardian_phone, guardian_occupation, address
staff: staff_code, first_name, last_name, phone, email, designation, department, qualification, address, date_of_joining
fee_receipt: challan_no, student_code, amount_paid (digits only, the amount actually deposited), paid_on, bank_reference
Rules:
- Copy text exactly as printed. NEVER guess, infer, or complete partial text. If a character is unclear, lower the confidence.
- Dates as YYYY-MM-DD. Phone numbers digits only (keep leading 0 or +92).
- confidence 0..1 per field: 0.95+ only if perfectly clear.
- legible=false if the photo is blurred, cropped, too dark, glared, or the key identifiers are unreadable. List each issue in qualityIssues.
- authenticityNotes: note missing bank stamp/signature, signs of editing, overwritten digits, mismatched fonts, or totals that don't add up. Empty if nothing suspicious.`;

export const Route = createFileRoute("/api/scan-document")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await getRequestUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const { data: roles } = await auth.supabase.from("user_roles").select("role").eq("user_id", auth.userId);
        const staffRoles = (roles ?? []).filter((r) => r.role !== "student");
        if (staffRoles.length === 0) return new Response("Forbidden", { status: 403 });

        const body = (await request.json().catch(() => null)) as { image?: unknown } | null;
        const image = typeof body?.image === "string" ? body.image : "";
        const m = /^data:(image\/(?:jpeg|png|webp));base64,/.exec(image);
        if (!m) return new Response("Please upload a JPG, PNG or WebP photo.", { status: 400 });
        if (image.length * 0.75 > MAX_BYTES) return new Response("Photo is too large (max 8 MB).", { status: 413 });

        const tenantId = await resolveTenantId(auth.supabase, auth.userId);
        const cap = await checkTenantCap(auth.supabase, tenantId);
        if (!cap.allowed) return new Response(CAP_REACHED_MESSAGE, { status: 429 });

        const selected = await selectChatProvider();
        if (!selected) return new Response("AI is not configured", { status: 500 });
        const provider = selected.isFallback
          ? createFallbackProvider(selected.apiKey)
          : createAssistantProvider(selected.apiKey);
        const model = selected.isFallback ? provider.chat(selected.model) : provider.responses(selected.model);

        try {
          const result = await generateObject({
            model,
            schema,
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: PROMPT },
                  { type: "image", image },
                ],
              },
            ],
          });
          await recordUsage({
            tenantId,
            userId: auth.userId,
            feature: "chat",
            model: selected.model,
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
          });
          const obj = result.object;
          return Response.json({
            ...obj,
            fields: obj.fields
              .filter((f) => f.value.trim())
              .map((f) => ({ ...f, confidence: Math.max(0, Math.min(1, f.confidence)) })),
            model: selected.model,
          });
        } catch (error) {
          markProviderDown(selected.provider, error);
          console.error("scan-document failed", error);
          return new Response("Could not read this document. Please try again.", { status: 502 });
        }
      },
    },
  },
});
