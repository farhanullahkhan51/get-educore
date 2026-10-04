import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";
import {
  analyzeClashes, applyProposals, findAvailableSlots, loadTimetable, matchIds, optimizeSchedule, resolveCampus,
} from "@/lib/timetable-engine";

const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }], structuredContent: JSON.parse(JSON.stringify(v)) as { [k: string]: string } });
const fail = (m: string) => ({ content: [{ type: "text" as const, text: m }], isError: true });

export const analyzeTimetableClashes = defineTool({
  name: "analyze_timetable_clashes",
  title: "Analyse timetable clashes",
  description: "Scan a campus timetable for teacher double-bookings, room clashes, lessons placed in breaks, overloaded teacher days and assigned courses that have no periods yet.",
  inputSchema: {
    campus_id: z.string().optional().describe("Campus id; defaults to the first campus visible to the user."),
    section: z.string().optional().describe("Optional section name or id to focus on, e.g. 'Grade 9 A'."),
    teacher: z.string().optional().describe("Optional teacher name or id to focus on."),
    max_daily_periods: z.number().int().min(1).max(12).default(6),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campus_id, section, teacher, max_daily_periods }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const sb = supabaseForUser(ctx);
      const campus = await resolveCampus(sb, campus_id);
      if (!campus) return fail("No campus found.");
      const d = await loadTimetable(sb, campus);
      return json(analyzeClashes(d, { maxDailyPeriods: max_daily_periods, sectionId: matchIds(d.sections, section)[0], teacherId: matchIds(d.teachers, teacher)[0] }));
    } catch (e) { return fail((e as Error).message); }
  },
});

export const optimizeTimetableSchedule = defineTool({
  name: "optimize_timetable_schedule",
  title: "Auto-fill timetable",
  description: "Fill empty timetable slots with each section's assigned courses and teachers, clash-free, balanced across the week and respecting breaks. Existing lessons are never changed. Set apply=false to preview first.",
  inputSchema: {
    campus_id: z.string().optional(),
    sections: z.array(z.string()).optional().describe("Section names or ids; omit for all sections with teaching assignments."),
    max_daily_periods: z.number().int().min(1).max(12).default(6).describe("Maximum periods a teacher teaches per day."),
    max_per_course_daily: z.number().int().min(1).max(4).default(1).describe("How often one subject may appear per day per section."),
    apply: z.boolean().default(false).describe("true = save to the timetable; false = preview only."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ campus_id, sections, max_daily_periods, max_per_course_daily, apply }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const sb = supabaseForUser(ctx);
      const campus = await resolveCampus(sb, campus_id);
      if (!campus) return fail("No campus found.");
      const d = await loadTimetable(sb, campus);
      if (!d.periods.length) return fail("This campus has no timetable periods defined yet.");
      const ids = (sections ?? []).flatMap((s) => matchIds(d.sections, s));
      const plan = optimizeSchedule(d, { sectionIds: ids, maxDailyPeriods: max_daily_periods, maxPerCourseDaily: max_per_course_daily });
      if (!apply) return json({ mode: "preview", proposed: plan.proposals.length, proposals: plan.proposals.slice(0, 200), unfilled_slots: plan.unfilled_slots.slice(0, 100) });
      const res = await applyProposals(sb, d, null, plan.proposals);
      return json({ mode: "applied", ...res, unfilled_slots: plan.unfilled_slots.slice(0, 100) });
    } catch (e) { return fail((e as Error).message); }
  },
});

export const findAvailableSlotsTool = defineTool({
  name: "find_available_slots",
  title: "Find free timetable slots",
  description: "Find periods when the given teachers, sections and/or room are all free, e.g. 'when are the Physics teacher and Grade 9 A both free on Thursday?'.",
  inputSchema: {
    campus_id: z.string().optional(),
    teachers: z.array(z.string()).optional().describe("Teacher names or ids."),
    sections: z.array(z.string()).optional().describe("Section names or ids."),
    room: z.string().optional(),
    day: z.enum(["any", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).default("any"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ campus_id, teachers, sections, room, day }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    try {
      const sb = supabaseForUser(ctx);
      const campus = await resolveCampus(sb, campus_id);
      if (!campus) return fail("No campus found.");
      const d = await loadTimetable(sb, campus);
      const days = ["any", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const slots = findAvailableSlots(d, {
        teacherIds: (teachers ?? []).flatMap((t) => matchIds(d.teachers, t).slice(0, 1)),
        sectionIds: (sections ?? []).flatMap((s) => matchIds(d.sections, s).slice(0, 1)),
        room, day: day === "any" ? undefined : days.indexOf(day) - 1,
      });
      return json({ count: slots.length, slots });
    } catch (e) { return fail((e as Error).message); }
  },
});
