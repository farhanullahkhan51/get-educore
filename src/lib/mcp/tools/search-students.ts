import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_students",
  title: "Search students",
  description:
    "Find students by name or student ID. Returns name, student ID, status, grade, academic system and guardian contact.",
  inputSchema: {
    query: z.string().trim().default("").describe("Name or student ID fragment. Leave empty to list recent students."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum students to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("students")
      .select(
        "student_code, first_name, last_name, status, grade, academic_system, guardian_name, guardian_phone, class_id, section_id",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (query) {
      const safe = query.replace(/[%,()]/g, " ").trim();
      q = q.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,student_code.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { students: data ?? [], count: data?.length ?? 0 },
    };
  },
});
