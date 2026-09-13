import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_staff",
  title: "List staff",
  description: "List staff members with designation, department, status and contact details.",
  inputSchema: {
    query: z.string().trim().default("").describe("Name or staff ID fragment. Leave empty to list everyone."),
    limit: z.number().int().min(1).max(50).default(25).describe("Maximum staff records to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("staff")
      .select("staff_code, first_name, last_name, designation, department, status, email, phone")
      .order("first_name")
      .limit(limit);
    if (query) {
      const safe = query.replace(/[%,()]/g, " ").trim();
      q = q.or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,staff_code.ilike.%${safe}%`);
    }
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { staff: data ?? [], count: data?.length ?? 0 },
    };
  },
});
