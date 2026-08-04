import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, stepCountIs, type UIMessage } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayResponseHeaders,
  getLovableAiGatewayRunId,
} from "@/lib/ai-gateway.server";
import { getRequestUser } from "@/lib/supabase-request.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Db = SupabaseClient<Database>;

function buildTools(supabase: Db) {
  const count = async (table: "campuses" | "students" | "staff" | "programs" | "classes" | "sections") => {
    const { count: c } = await supabase.from(table).select("id", { count: "exact", head: true });
    return c ?? 0;
  };

  return {
    institution_overview: tool({
      description:
        "Headline counts for the institution the signed-in user can access: campuses, students, staff, programs, classes and sections.",
      inputSchema: z.object({}),
      execute: async () => ({
        campuses: await count("campuses"),
        students: await count("students"),
        staff: await count("staff"),
        programs: await count("programs"),
        classes: await count("classes"),
        sections: await count("sections"),
      }),
    }),

    list_campuses: tool({
      description: "List campuses with their code and academic system.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from("campuses")
          .select("id, name, code, academic_system, phone, email")
          .order("name");
        return data ?? [];
      },
    }),

    search_students: tool({
      description:
        "Search students by name, student code, guardian name or guardian occupation. Returns up to 25 matching student records.",
      inputSchema: z.object({
        query: z.string().describe("Free-text search term. Use an empty string to list recent students."),
        status: z.enum(["any", "active", "inactive"]).describe("Filter by enrollment status; 'any' for no filter."),
      }),
      execute: async ({ query, status }) => {
        let q = supabase
          .from("students")
          .select(
            "id, student_code, first_name, last_name, grade, status, academic_system, guardian_name, guardian_phone, guardian_occupation, admission_date, campus_id",
          )
          .limit(25);
        const term = query.trim();
        if (term) {
          const like = `%${term}%`;
          q = q.or(
            `first_name.ilike.${like},last_name.ilike.${like},student_code.ilike.${like},guardian_name.ilike.${like},guardian_occupation.ilike.${like}`,
          );
        }
        if (status !== "any") q = q.eq("status", status);
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    search_staff: tool({
      description: "Search staff by name, staff code, designation or department.",
      inputSchema: z.object({
        query: z.string().describe("Free-text search term; empty string lists recent staff."),
      }),
      execute: async ({ query }) => {
        let q = supabase
          .from("staff")
          .select("id, staff_code, first_name, last_name, designation, department, status, date_of_joining, campus_id")
          .limit(25);
        const term = query.trim();
        if (term) {
          const like = `%${term}%`;
          q = q.or(
            `first_name.ilike.${like},last_name.ilike.${like},staff_code.ilike.${like},designation.ilike.${like},department.ilike.${like}`,
          );
        }
        const { data, error } = await q.order("created_at", { ascending: false });
        if (error) return { error: error.message };
        return data ?? [];
      },
    }),

    fees_summary: tool({
      description:
        "Fee collection summary from challans: totals billed, collected and outstanding, a breakdown by challan status, and a per-month breakdown. Optionally filter to a single billing month.",
      inputSchema: z.object({
        month: z
          .string()
          .describe(
            "Billing month to filter on as YYYY-MM (e.g. '2026-07' for July 2026). Use an empty string for all months.",
          ),
      }),
      execute: async ({ month }) => {
        const { data, error } = await supabase
          .from("fee_challans")
          .select("gross_amount, discount_amount, fine_amount, paid_amount, status, due_date, period_label")
          .limit(5000);
        if (error) return { error: error.message };

        const monthKey = (r: { due_date: string | null; period_label: string | null }) => {
          const fromLabel = (r.period_label ?? "").match(/(\d{4})[-/](\d{1,2})/);
          if (fromLabel) return `${fromLabel[1]}-${fromLabel[2].padStart(2, "0")}`;
          return r.due_date ? r.due_date.slice(0, 7) : "unknown";
        };
        const wanted = month.trim().replace(/\//g, "-");
        const normalizedWanted = /^\d{4}-\d{1,2}$/.test(wanted)
          ? `${wanted.slice(0, 4)}-${wanted.slice(5).padStart(2, "0")}`
          : "";

        const all = data ?? [];
        const rows = normalizedWanted ? all.filter((r) => monthKey(r) === normalizedWanted) : all;

        let billed = 0;
        let collected = 0;
        const byStatus: Record<string, number> = {};
        const byMonth: Record<string, { billed: number; collected: number; challans: number }> = {};
        for (const r of rows) {
          const net = Number(r.gross_amount ?? 0) - Number(r.discount_amount ?? 0) + Number(r.fine_amount ?? 0);
          const paid = Number(r.paid_amount ?? 0);
          billed += net;
          collected += paid;
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          const key = monthKey(r);
          const bucket = (byMonth[key] ??= { billed: 0, collected: 0, challans: 0 });
          bucket.billed += net;
          bucket.collected += paid;
          bucket.challans += 1;
        }
        return {
          month: normalizedWanted || "all",
          challans: rows.length,
          billed: Math.round(billed),
          collected: Math.round(collected),
          outstanding: Math.round(billed - collected),
          collection_rate_percent: billed ? Math.round((collected / billed) * 100) : 0,
          challans_by_status: byStatus,
          by_month: Object.fromEntries(
            Object.entries(byMonth)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [
                k,
                {
                  challans: v.challans,
                  billed: Math.round(v.billed),
                  collected: Math.round(v.collected),
                  outstanding: Math.round(v.billed - v.collected),
                },
              ]),
          ),
        };
      },
    }),


    attendance_summary: tool({
      description: "Attendance summary over the last N days: present/absent/late counts and attendance rate.",
      inputSchema: z.object({
        days: z.number().int().describe("How many days back to look, e.g. 30."),
      }),
      execute: async ({ days }) => {
        const span = Math.min(Math.max(Math.round(days) || 30, 1), 365);
        const since = new Date(Date.now() - span * 86400000).toISOString().slice(0, 10);
        const { data, error } = await supabase
          .from("attendance_records")
          .select("status, date")
          .gte("date", since)
          .limit(10000);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        const present = (byStatus["present"] ?? 0) + (byStatus["late"] ?? 0);
        return {
          days: span,
          records: rows.length,
          by_status: byStatus,
          attendance_rate_percent: rows.length ? Math.round((present / rows.length) * 100) : 0,
        };
      },
    }),

    admissions_summary: tool({
      description: "Admissions funnel: inquiry counts by status and recent inquiries.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("inquiries")
          .select("student_name, grade_applying_for, status, source, created_at, converted_student_id")
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
        return {
          total_inquiries: rows.length,
          by_status: byStatus,
          converted: rows.filter((r) => r.converted_student_id).length,
          recent: rows.slice(0, 10),
        };
      },
    }),

    results_summary: tool({
      description: "Report card / results summary: counts by status and average overall percentage (marks).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("report_cards")
          .select("status, overall_percent, term, academic_year")
          .limit(2000);
        if (error) return { error: error.message };
        const rows = data ?? [];
        const byStatus: Record<string, number> = {};
        let sum = 0;
        let n = 0;
        for (const r of rows) {
          byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
          if (r.overall_percent != null) {
            sum += Number(r.overall_percent);
            n += 1;
          }
        }
        return {
          report_cards: rows.length,
          by_status: byStatus,
          average_marks_percent: n ? Math.round((sum / n) * 10) / 10 : null,
        };
      },
    }),
    class_roster: tool({
      description:
        "List the students enrolled in a specific class (grade group) and optionally a section. Use this whenever the user asks who studies in a class, e.g. 'show students of Grade 9' or 'O-Level Year 1 section A'.",
      inputSchema: z.object({
        class_name: z
          .string()
          .describe("Class or grade name as the user said it, e.g. 'Grade 9', '9', 'O-Level Year 1'."),
        section_name: z.string().describe("Section name such as 'A'. Use an empty string for all sections."),
      }),
      execute: async ({ class_name, section_name }) => {
        const term = class_name.trim();
        let cq = supabase.from("classes").select("id, name, grade_level, academic_year, campus_id, academic_system");
        if (term) cq = cq.or(`name.ilike.%${term}%,grade_level.ilike.%${term}%`);
        const { data: classes, error: cErr } = await cq.limit(10);
        if (cErr) return { error: cErr.message };
        if (!classes?.length) return { error: `No class matching "${term}" was found.` };

        const classIds = classes.map((c) => c.id);
        const { data: sections } = await supabase
          .from("sections")
          .select("id, name, class_id")
          .in("class_id", classIds);

        let sectionIds = (sections ?? []).map((s) => s.id);
        const sec = section_name.trim();
        if (sec) {
          sectionIds = (sections ?? []).filter((s) => s.name.toLowerCase() === sec.toLowerCase()).map((s) => s.id);
        }

        let sq = supabase
          .from("students")
          .select("id, student_code, first_name, last_name, grade, status, section_id, class_id, guardian_name")
          .limit(300);
        sq = sec && sectionIds.length ? sq.in("section_id", sectionIds) : sq.in("class_id", classIds);
        const { data: students, error: sErr } = await sq.order("first_name");
        if (sErr) return { error: sErr.message };

        const sectionMap = new Map((sections ?? []).map((s) => [s.id, s.name]));
        return {
          matched_classes: classes.map((c) => ({ id: c.id, name: c.name, academic_year: c.academic_year })),
          section_filter: sec || "all sections",
          total_students: students?.length ?? 0,
          students: (students ?? []).map((s) => ({
            student_code: s.student_code,
            name: `${s.first_name} ${s.last_name}`,
            section: s.section_id ? (sectionMap.get(s.section_id) ?? null) : null,
            grade: s.grade,
            status: s.status,
            guardian_name: s.guardian_name,
          })),
        };
      },
    }),
  };
}

const SYSTEM_PROMPT = `You are the EduCore Assistant, an analyst built into an academic ERP used by school and college administrators.

Rules:
- Answer questions using the provided tools. Never invent numbers; if a tool returns nothing, say so plainly.
- You only ever see data the signed-in user is permitted to see. If something looks missing, explain it may be outside their access rather than claiming it does not exist.
- Be concise and factual. Use short markdown: bold key figures, compact tables for lists, bullet points for breakdowns.
- Use "marks" rather than "GPA" when discussing academic performance.
- Currency figures are in the institution's default currency; do not add a currency symbol unless the user does.
- Dates and periods: interpret a period, due date or month written as "2026/07", "2026-07", "07/2026" or "July 26" as the calendar month July 2026, and always say it back in words (e.g. "July 2026"). When a user mentions a month in a fees question, pass it to fees_summary as YYYY-MM. A four-digit part is always the year; a one/two-digit part is always the month.
- You are read-only. If asked to create, edit or delete records, explain which module in the app does that (Students, Staff, Admissions, Fees, Academics, Results, Certificates) instead of attempting it.`;

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

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        const { supabase, userId } = auth;

        if (threadId) {
          const { data: thread } = await supabase
            .from("ai_threads")
            .select("id")
            .eq("id", threadId)
            .maybeSingle();
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

        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(apiKey, initialRunId);

        const result = streamText({
          model: gateway("openai/gpt-5.6-sol"),
          system: SYSTEM_PROMPT,
          messages: await convertToModelMessages(uiMessages),
          tools: buildTools(supabase),
          stopWhen: stepCountIs(50),
          providerOptions: { lovable: { reasoningEffort: "none" } },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: uiMessages,
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
            await supabase
              .from("ai_threads")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", threadId);
          },
          headers: getLovableAiGatewayResponseHeaders(undefined),
        });
      },
    },
  },
});
