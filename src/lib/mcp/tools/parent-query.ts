import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import { QUERY_TOPICS, parentSnapshot } from "@/lib/parent-query";

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: JSON.parse(JSON.stringify(v)) as { [k: string]: string } });

export const handleParentQuery = defineTool({
  name: "handle_parent_query",
  title: "Answer a parent's question",
  description:
    "Answer a parent/guardian question about their own child (fee dues, attendance, results, today's timetable, school notices). Requires BOTH the student code and the guardian phone number the parent gave; both must match the record on file or nothing is returned. Never guess identifiers and never share details of any other student. Reply politely; answer in Urdu if the parent wrote in Urdu.",
  inputSchema: {
    student_code: z.string().trim().min(1).max(40).describe("Student / roll / GR code the parent gave."),
    guardian_phone: z.string().trim().min(7).max(20).describe("Phone number the parent is contacting from or gave."),
    topics: z.array(z.enum(QUERY_TOPICS)).default([]).describe("Which areas to fetch; empty = all."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ student_code, guardian_phone, topics }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try { return json(await parentSnapshot(supabaseForUser(ctx), student_code, guardian_phone, topics)); }
    catch (e) { return { content: [{ type: "text" as const, text: (e as Error).message }], isError: true }; }
  },
});
