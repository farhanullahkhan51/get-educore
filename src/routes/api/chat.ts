import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, type UIMessage } from "ai";
import {
  CAP_REACHED_MESSAGE,
  checkTenantCap,
  createAssistantProvider,
  getChatModelId,
  getOpenAiKey,
  recordUsage,
  resolveTenantId,
} from "@/lib/ai-provider.server";
import { getRequestUser } from "@/lib/supabase-request.server";
import { buildAssistantTools, loadAssistantContext } from "@/lib/assistant-tools.server";


const SYSTEM_PROMPT = `You are the EduCore Assistant, an operator built into an academic ERP used by school and college administrators. You can both read and change records.

Rules:
- Answer questions and carry out instructions using the provided tools. Never invent numbers; if a tool returns nothing, say so plainly.
- You only ever see and change data the signed-in user is permitted to touch. If something looks missing, explain it may be outside their access rather than claiming it does not exist.
- Creating, editing and deleting: call the matching tool directly. Every mutating tool asks the user to confirm in the chat before it runs, so do not ask for confirmation yourself in text — just call the tool with your best-filled arguments. If the user denies it, acknowledge and stop.
- Before creating something that belongs to a class, section, course, program or campus, use list_academic_structure, search_students or search_staff to resolve the exact record the user meant. If a name is ambiguous the tool will tell you — relay the options and ask which one.
- Multi-step requests: perform the steps in order, one tool call at a time, and report what happened at the end.
- Fields you do not know can be passed as an empty string (or 0 for numbers); do not invent guardian names, phone numbers, dates or amounts.
- Be concise and factual. Use short markdown: bold key figures, compact tables for lists, bullet points for breakdowns.
- Use "marks" rather than "GPA" when discussing academic performance.
- Currency figures are in the institution's default currency; do not add a currency symbol unless the user does.
- Dates and periods: interpret a period, due date or month written as "2026/07", "2026-07", "07/2026" or "July 26" as the calendar month July 2026, and always say it back in words (e.g. "July 2026"). When a user mentions a month in a fees question, pass it to fees_summary as YYYY-MM. A four-digit part is always the year; a one/two-digit part is always the month.
- Deletions are permanent. Some tools refuse to delete records that still have dependants; relay the reason and suggest what to clear first.
- Undo: when the user says "undo", "revert that", "take it back" or similar, call list_undoable_changes, state in one line exactly what will be reverted, then call undo_change (empty change_id = most recent). If they name an older change, pick its id from the list. If nothing can be undone, say so plainly.
- Interface changes: when the user asks for a module to be arranged differently (e.g. "separate Board classes from Cambridge classes", "group students by section", "hide the guardian column", "make fees compact"), call list_module_layout_options for that module first, then set_module_layout with supported values only. Never claim you cannot change the interface, and never invent options. Default to scope "personal"; use "institution" only when the user asks for everyone. Use reset_module_layout to put a module back to default.`;


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await getRequestUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const body = (await request.json()) as { messages?: unknown; threadId?: unknown };
        const messages = body.messages;
        const threadId = typeof body.threadId === "string" ? body.threadId : null;
        if (!Array.isArray(messages)) return new Response("Messages are required", { status: 400 });

        const apiKey = getOpenAiKey();
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        const { supabase, userId } = auth;

        const tenantId = await resolveTenantId(supabase, userId);
        const cap = await checkTenantCap(supabase, tenantId);
        if (!cap.allowed) return new Response(CAP_REACHED_MESSAGE, { status: 429 });


        if (threadId) {
          const { data: thread } = await supabase.from("ai_threads").select("id").eq("id", threadId).maybeSingle();
          if (!thread) return new Response("Thread not found", { status: 404 });
        }

        const uiMessages = messages as UIMessage[];
        const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");

        if (threadId && lastUser) {
          const { data: existing } = await supabase
            .from("ai_messages")
            .select("id")
            .eq("thread_id", threadId)
            .eq("client_id", lastUser.id)
            .maybeSingle();
          if (!existing) {
            const { error } = await supabase.from("ai_messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "user",
              client_id: lastUser.id,
              parts: lastUser.parts as unknown as never,
            });
            if (error) console.error("[chat] failed to save user message", error.message);
          }
        }

        const openai = createAssistantProvider(apiKey);
        const modelId = getChatModelId();
        const assistantContext = await loadAssistantContext(supabase, userId);

        const result = streamText({
          model: openai.responses(modelId),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(uiMessages),
          tools: buildAssistantTools(assistantContext),
          stopWhen: stepCountIs(50),
          providerOptions: {
            openai: {
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
          onFinish: async ({ totalUsage }) => {
            await recordUsage({
              tenantId,
              userId,
              feature: "chat",
              model: modelId,
              inputTokens: totalUsage?.inputTokens ?? 0,
              outputTokens: totalUsage?.outputTokens ?? 0,
            });
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
          sendReasoning: true,
          onFinish: async ({ responseMessage }) => {
            if (!threadId || !responseMessage) return;
            const { error } = await supabase.from("ai_messages").insert({
              thread_id: threadId,
              user_id: userId,
              role: "assistant",
              client_id: responseMessage.id,
              parts: responseMessage.parts as unknown as never,
            });
            if (error) console.error("[chat] failed to save assistant message", error.message);
            await supabase.from("ai_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
          },
          onError: (error) => {
            console.error("[chat] stream error", error);
            return error instanceof Error ? error.message : "An error occurred.";
          },
          headers: {
            "X-AI-Usage-State": cap.nearLimit ? "near-limit" : "ok",
            "Access-Control-Expose-Headers": "X-AI-Usage-State",
          },
        });

      },
    },
  },
});
