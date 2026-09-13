import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_inquiry",
  title: "Create admission inquiry",
  description:
    "Record a new admission inquiry in the admissions pipeline. Only supply details the user actually provided.",
  inputSchema: {
    student_name: z.string().trim().min(1).describe("Prospective student's full name."),
    guardian_name: z.string().trim().min(1).describe("Guardian's full name."),
    guardian_phone: z.string().trim().min(1).describe("Guardian's contact number."),
    guardian_email: z.string().trim().default("").describe("Guardian's email, if known."),
    grade_applying_for: z.string().trim().default("").describe("Class or grade applied for, e.g. Class 9."),
    academic_system: z
      .enum(["unspecified", "board", "cambridge"])
      .default("unspecified")
      .describe("Preferred academic track."),
    notes: z.string().trim().default("").describe("Any extra context from the enquiry."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("inquiries")
      .insert({
        student_name: input.student_name,
        guardian_name: input.guardian_name,
        guardian_phone: input.guardian_phone,
        guardian_email: input.guardian_email || null,
        grade_applying_for: input.grade_applying_for || null,
        academic_system: input.academic_system === "unspecified" ? null : input.academic_system,
        notes: input.notes || null,
        source: "assistant",
      })
      .select("id, student_name, guardian_name, status, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Inquiry recorded for ${data.student_name}.` }],
      structuredContent: { inquiry: data },
    };
  },
});
