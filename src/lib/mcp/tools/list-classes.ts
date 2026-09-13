import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_classes",
  title: "List classes and sections",
  description:
    "List the institution's classes with their sections, capacity and academic system (Board or Cambridge).",
  inputSchema: {
    academic_system: z
      .enum(["all", "board", "cambridge"])
      .default("all")
      .describe("Restrict to one academic track."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ academic_system }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    let classQuery = supabase
      .from("classes")
      .select("id, name, grade_level, academic_year, academic_system")
      .order("name");
    if (academic_system !== "all") classQuery = classQuery.eq("academic_system", academic_system);

    const [{ data: classes, error }, { data: sections, error: sectionError }] = await Promise.all([
      classQuery,
      supabase.from("sections").select("id, name, class_id, capacity").order("name"),
    ]);
    if (error || sectionError) {
      return { content: [{ type: "text", text: (error ?? sectionError)!.message }], isError: true };
    }

    const rows = (classes ?? []).map((c) => ({
      ...c,
      sections: (sections ?? [])
        .filter((s) => s.class_id === c.id)
        .map((s) => ({ name: s.name, capacity: s.capacity })),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { classes: rows, count: rows.length },
    };
  },
});
