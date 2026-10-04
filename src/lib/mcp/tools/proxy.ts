import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import { resolveCampus, matchIds } from "@/lib/timetable-engine";
import { applyProxies, loadProxyData, planProxies } from "@/lib/proxy-engine";

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: JSON.parse(JSON.stringify(v)) as { [k: string]: string } });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: m }], isError: true });

export const allocateProxyTeacher = defineTool({
  name: "allocate_proxy_teacher",
  title: "Allocate proxy teachers",
  description: "For absent teachers on a date, list every lesson they would miss and rank free teachers to cover each one (same department and subject first, lightest load, fair weekly share). Set apply=true to save the recommended proxies.",
  inputSchema: {
    absent_teachers: z.array(z.string()).min(1).describe("Names or ids of absent teachers."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; defaults to today."),
    campus_id: z.string().optional(),
    max_weekly_proxies: z.number().int().min(1).max(20).default(4),
    apply: z.boolean().default(false).describe("true = save; false = preview only."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ absent_teachers, date, campus_id, max_weekly_proxies, apply }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const sb = supabaseForUser(ctx);
      const campus = await resolveCampus(sb, campus_id);
      if (!campus) return fail("No campus found.");
      const day = date ?? new Date().toISOString().slice(0, 10);
      const pd = await loadProxyData(sb, campus, day);
      const ids = absent_teachers.flatMap((t) => matchIds(pd.tt.teachers, t).slice(0, 1));
      if (!ids.length) return fail("No matching teacher found.");
      const plan = planProxies(pd, ids, { maxWeeklyProxies: max_weekly_proxies });
      if (!apply) return json({ mode: "preview", ...plan });
      return json({ mode: "applied", ...(await applyProxies(sb, pd, null, plan)), plan });
    } catch (e) { return fail((e as Error).message); }
  },
});
